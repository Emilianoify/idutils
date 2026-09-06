import type { Role } from '../../generated/prisma/enums.js'
import type { SessionTokens } from '../../domain/repositories/ITokenService.js'

export interface LoginCommand {
  email: string
  password: string
}

/**
 * El usuario tal como sale hacia el frontend.
 *
 * No es `User` ni `PublicUser` del dominio: es lo que la pantalla necesita.
 * `tokenVersion` no esta porque no le sirve a nadie afuera, y `passwordHash`
 * no puede estar por construccion.
 */
export interface AuthenticatedUserView {
  id: string
  email: string
  name: string
  role: Role
}

/**
 * Los tokens viajan APARTE de la vista del usuario.
 *
 * El controller pone los tokens en cookies httpOnly y manda al frontend
 * solamente `user`. Si los tokens estuvieran adentro del mismo objeto, el dia
 * que alguien serialice la respuesta entera en un log van a quedar dos
 * credenciales escritas en disco.
 */
export interface LoginResult {
  user: AuthenticatedUserView
  tokens: SessionTokens
}

export interface RefreshSessionResult extends LoginResult {
  sessionId: string
}
