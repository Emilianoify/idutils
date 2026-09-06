import type { Role } from '../../generated/prisma/enums.js'

/**
 * Lo que viaja adentro del token. Nada mas que esto.
 *
 * NO lleva nombre ni email: un token es un dato que el cliente puede leer, y
 * cada campo que se agrega es un dato que queda cacheado en el navegador hasta
 * que expira. El nombre se pide con `GET /api/auth/me`, que siempre dice la
 * verdad de ahora.
 *
 * `tokenVersion` es la frontera de revocacion GLOBAL: si no coincide con el
 * usuario, todas sus sesiones anteriores estan muertas. La rotacion por
 * dispositivo usa `sessionId` y `tokenId` solo en el refresh.
 */
export interface SessionClaims {
  userId: string
  role: Role
  tokenVersion: number
}

export interface RefreshSessionClaims extends SessionClaims {
  sessionId: string
  tokenId: string
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

export interface IssuedSessionTokens extends SessionTokens {
  refreshSession: {
    id: string
    tokenId: string
    expiresAt: Date
  }
}

/**
 * La firma y verificacion de tokens, como puerto.
 *
 * Los dos tokens se emiten JUNTOS, en una sola operacion, y no con dos metodos
 * sueltos. Emitir uno sin el otro no es un caso valido: el access sin refresh
 * deja al operador afuera a los 15 minutos, y el refresh sin access no
 * autentica nada.
 */
export interface ITokenService {
  issue(claims: SessionClaims, sessionId?: string): IssuedSessionTokens

  /**
   * Devuelven `null` cuando el token es invalido, vencido o esta firmado con
   * otro secreto. No tiran: un token vencido es el caso NORMAL de una sesion
   * larga, no una excepcion.
   */
  verifyAccess(token: string): SessionClaims | null
  verifyRefresh(token: string): RefreshSessionClaims | null

  /**
   * Cuanto vive cada token, en segundos.
   *
   * Se expone desde aca porque la cookie tiene que durar exactamente lo mismo
   * que el token que lleva adentro. Si se escriben en dos lugares, un dia van a
   * decir cosas distintas y el sintoma va a ser "a veces me desloguea".
   */
  readonly accessTokenSeconds: number
  readonly refreshTokenSeconds: number
}
