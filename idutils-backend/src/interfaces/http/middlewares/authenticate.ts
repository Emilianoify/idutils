import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Role } from '../../../generated/prisma/enums.js'
import type { ITokenService } from '../../../domain/repositories/ITokenService.js'
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { ACCESS_COOKIE } from '../cookies.js'

/**
 * Autenticación por cookie httpOnly, contra el estado ACTUAL del usuario.
 *
 * La firma del token no alcanza, y esa es la decisión que se tomó acá.
 *
 * Un token firmado dice quién era el usuario cuando inició sesión. Con eso
 * solo, dar de baja a alguien le corta el refresh al instante pero su access
 * token sigue sirviendo hasta que venza: hasta quince minutos de alguien que ya
 * no trabaja acá entrando a fichas de pacientes. En una coordinación de cinco
 * personas, quince minutos es toda la tarde.
 *
 * Por eso cada pedido lee el usuario. Es una consulta por clave primaria y una
 * coordinación no tiene un problema de volumen, tiene un problema de memoria
 * (D0). El precio es que la API deja de ser sin estado; lo que se compra es que
 * "dar de baja" signifique ahora y no dentro de un rato.
 *
 * El rol también sale de la base y no del token: un ADMIN que pasó a LECTOR
 * pierde los permisos en el acto, sin esperar a que venza nada.
 */
export function createAuthenticate(
  tokenService: ITokenService,
  userRepository: IUserRepository,
): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readAccessToken(request)

      if (token === null) {
        throw new AppError(401, ERROR_MESSAGES.AUTH.UNAUTHENTICATED)
      }

      const claims = tokenService.verifyAccess(token)
      if (claims === null) {
        // Vencido o adulterado: para el cliente es lo mismo. El frontend
        // reacciona pegándole a /auth/refresh una sola vez.
        throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
      }

      const user = await userRepository.findById(claims.userId)
      if (user === null) {
        throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
      }

      if (!user.active) {
        throw new AppError(403, ERROR_MESSAGES.AUTH.INACTIVE_USER)
      }

      // El corte de verdad: si el número del token no es el del usuario, ese
      // token nació antes de un cambio de contraseña o de una baja.
      if (claims.tokenVersion !== user.tokenVersion) {
        throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
      }

      request.auth = {
        userId: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

function readAccessToken(request: Request): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined
  const token = cookies?.[ACCESS_COOKIE]

  return typeof token === 'string' && token.length > 0 ? token : null
}

/**
 * Los tres roles de D14, y nada más hasta que duela.
 *
 * Se declara QUÉ ROLES PUEDEN, no cuáles no pueden. La lista blanca es la que
 * falla cerrada: el día que se agregue un rol nuevo, no entra a ninguna ruta
 * hasta que alguien lo decida explícitamente. Con una lista negra entraría a
 * todas.
 */
export function requireRole(...allowed: readonly Role[]): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const auth = request.auth

    if (auth === undefined) {
      // Sin `authenticate` antes, esto no es "prohibido": es una ruta mal
      // armada. Se contesta 401 igual, pero el orden correcto es siempre
      // authenticate -> requireRole.
      next(new AppError(401, ERROR_MESSAGES.AUTH.UNAUTHENTICATED))
      return
    }

    if (!allowed.includes(auth.role)) {
      next(new AppError(403, ERROR_MESSAGES.AUTH.FORBIDDEN))
      return
    }

    next()
  }
}

/** El id del usuario autenticado, o falla. Evita el `req.auth!` en cada controller. */
export function currentUserId(request: Request): string {
  const auth = request.auth
  if (auth === undefined) throw new AppError(401, ERROR_MESSAGES.AUTH.UNAUTHENTICATED)

  return auth.userId
}
