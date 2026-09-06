import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type {
  ITokenService,
  IssuedSessionTokens,
  RefreshSessionClaims,
  SessionClaims,
} from '../../domain/repositories/ITokenService.js'

/**
 * Access corto, refresh largo. Los dos en cookies httpOnly.
 *
 * 15 minutos de access no es un numero al azar: es la ventana en la que un
 * token filtrado sirve para algo. El refresh de 7 dias es lo que evita que la
 * coordinadora tenga que escribir la contrasena cuatro veces por dia.
 */
const ACCESS_TOKEN_SECONDS = 15 * 60
const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60

/**
 * Dos secretos distintos, y no uno con un campo `type` adentro.
 *
 * Con un solo secreto, un access token robado se puede presentar en el
 * endpoint de refresh salvo que alguien se acuerde de chequear el campo. Con
 * dos, la firma no valida y no hay nada que recordar: el error se vuelve
 * imposible en vez de improbable.
 */
export class JwtTokenService implements ITokenService {
  readonly accessTokenSeconds = ACCESS_TOKEN_SECONDS
  readonly refreshTokenSeconds = REFRESH_TOKEN_SECONDS

  constructor(
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
  ) {}

  issue(claims: SessionClaims, existingSessionId?: string): IssuedSessionTokens {
    const sessionId = existingSessionId ?? randomUUID()
    const tokenId = randomUUID()
    const refreshClaims: RefreshSessionClaims = { ...claims, sessionId, tokenId }

    return {
      accessToken: jwt.sign(claims, this.accessSecret, {
        expiresIn: ACCESS_TOKEN_SECONDS,
        algorithm: 'HS256',
      }),
      refreshToken: jwt.sign(refreshClaims, this.refreshSecret, {
        expiresIn: REFRESH_TOKEN_SECONDS,
        algorithm: 'HS256',
      }),
      refreshSession: {
        id: sessionId,
        tokenId,
        expiresAt: new Date((Math.floor(Date.now() / 1000) + REFRESH_TOKEN_SECONDS) * 1000),
      },
    }
  }

  verifyAccess(token: string): SessionClaims | null {
    return this.verify(token, this.accessSecret)
  }

  verifyRefresh(token: string): RefreshSessionClaims | null {
    try {
      const payload = jwt.verify(token, this.refreshSecret, { algorithms: ['HS256'] })
      if (typeof payload === 'string') return null

      const claims = this.toClaims(payload)
      const { sessionId, tokenId } = payload
      if (claims === null) return null
      if (typeof sessionId !== 'string' || sessionId.length === 0) return null
      if (typeof tokenId !== 'string' || tokenId.length === 0) return null

      return { ...claims, sessionId, tokenId }
    } catch {
      return null
    }
  }

  private verify(token: string, secret: string): SessionClaims | null {
    try {
      // `algorithms` explicito y no vacio: sin eso, un token firmado con `none`
      // o con un algoritmo mas debil puede llegar a validar. Es la
      // vulnerabilidad clasica de JWT y se cierra con esta linea.
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })

      if (typeof payload === 'string') return null
      return this.toClaims(payload)
    } catch {
      // Vencido, mal firmado o basura: para el sistema es todo lo mismo, "no
      // hay sesion". Distinguirlos hacia afuera le contaria a un atacante si
      // acerto el formato.
      return null
    }
  }

  /**
   * El payload de `jwt.verify` es un objeto sin forma garantizada: viene de un
   * string que mando el cliente. Se revisa campo por campo en vez de castear,
   * porque un `as SessionClaims` haria que un token con `userId: 42` pasara
   * como valido y explotara tres capas mas adentro.
   */
  private toClaims(payload: jwt.JwtPayload): SessionClaims | null {
    const { userId, role, tokenVersion } = payload

    if (typeof userId !== 'string' || userId.length === 0) return null
    if (role !== 'ADMIN' && role !== 'OPERADOR' && role !== 'LECTOR') return null
    if (typeof tokenVersion !== 'number' || !Number.isInteger(tokenVersion)) return null

    return { userId, role, tokenVersion }
  }
}
