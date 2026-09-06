import type { Request, RequestHandler, Response } from 'express'
import { GetCurrentUserUseCase } from '../../../application/useCases/auth/getCurrentUserUseCase.js'
import { LoginUseCase } from '../../../application/useCases/auth/loginUseCase.js'
import { LogoutSessionUseCase } from '../../../application/useCases/auth/logoutSessionUseCase.js'
import { RefreshSessionUseCase } from '../../../application/useCases/auth/refreshSessionUseCase.js'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { sendOk } from '../../../shared/helpers/responseHelper.js'
import { REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from '../cookies.js'
import type { HttpDependencies } from '../dependencies.js'
import { currentUserId } from '../middlewares/authenticate.js'
import { auditSessionEvent } from '../middlewares/audit.js'
import { loginSchema } from '../schemas/authSchemas.js'

/**
 * Sesion.
 *
 * Los tokens NUNCA salen en el cuerpo de la respuesta: van en cookies
 * `httpOnly`, y al frontend le llega solamente el usuario. Si viajaran en el
 * JSON, el frontend tendria que guardarlos en algun lado, y ese algun lado
 * termina siendo `localStorage`, que lee cualquier script que entre a la
 * pagina.
 */
export function createAuthController(dependencies: HttpDependencies): {
  login: RequestHandler
  refresh: RequestHandler
  logout: RequestHandler
  me: RequestHandler
} {
  const { infrastructure, tokenService, passwordHasher, cookieSecure } = dependencies
  const cookieSettings = { secure: cookieSecure }

  const loginUseCase = new LoginUseCase(
    infrastructure.users,
    passwordHasher,
    tokenService,
    infrastructure.refreshSessions,
  )
  const refreshUseCase = new RefreshSessionUseCase(
    infrastructure.users,
    tokenService,
    infrastructure.refreshSessions,
  )
  const logoutUseCase = new LogoutSessionUseCase(tokenService, infrastructure.refreshSessions)
  const currentUserUseCase = new GetCurrentUserUseCase(infrastructure.users)


  return {
    login: async (request: Request, response: Response): Promise<void> => {
      const body = loginSchema.parse(request.body)
      const result = await loginUseCase.execute(body)

      setSessionCookies(response, result.tokens, tokenService, cookieSettings)
      sendOk(response, SUCCESS_MESSAGES.AUTH.LOGIN, result.user)
    },

    refresh: async (request: Request, response: Response): Promise<void> => {
      const cookies = request.cookies as Record<string, unknown> | undefined
      const token = cookies?.[REFRESH_COOKIE]

      if (typeof token !== 'string' || token.length === 0) {
        throw new AppError(401, ERROR_MESSAGES.AUTH.UNAUTHENTICATED)
      }

      const result = await refreshUseCase.execute(token)

      auditSessionEvent(request, response, {
        event: 'session_refreshed',
        userId: result.user.id,
        sessionId: result.sessionId,
      })
      setSessionCookies(response, result.tokens, tokenService, cookieSettings)
      sendOk(response, SUCCESS_MESSAGES.AUTH.REFRESHED, result.user)
    },

    /**
     * Cerrar sesion revoca la familia de ESTE navegador y borra sus cookies.
     *
     * No sube `tokenVersion` a proposito: eso mataria tambien la sesion del
     * celular y la de la compu de al lado, y elegimos permitir varias sesiones
     * por usuario. Para cerrar todas a la vez, el camino es cambiar la
     * contrasena, que es el momento en que uno REALMENTE quiere echar a todos.
     *
     * Contesta 200 aunque la cookie falte, sea invalida, haya vencido o la
     * familia ya estuviera revocada: cerrar algo cerrado es idempotente.
     */
    logout: async (request: Request, response: Response): Promise<void> => {
      clearSessionCookies(response, cookieSettings)

      const cookies = request.cookies as Record<string, unknown> | undefined
      const token = cookies?.[REFRESH_COOKIE]
      const loggedOut = await logoutUseCase.execute(
        typeof token === 'string' && token.length > 0 ? token : null,
      )

      if (loggedOut !== null) {
        auditSessionEvent(request, response, {
          event: 'session_logged_out',
          userId: loggedOut.userId,
          sessionId: loggedOut.sessionId,
        })
      }

      sendOk(response, SUCCESS_MESSAGES.AUTH.LOGOUT)
    },

    me: async (request: Request, response: Response): Promise<void> => {
      const user = await currentUserUseCase.execute(currentUserId(request))
      sendOk(response, SUCCESS_MESSAGES.AUTH.CURRENT_USER, user)
    },
  }
}
