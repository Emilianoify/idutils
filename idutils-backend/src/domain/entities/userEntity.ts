import type { Role } from '../../generated/prisma/enums.js'

/**
 * Tres roles, y no mas hasta que duela (D14). Un Role + Permission +
 * RolePermission es lo que se construye cuando el negocio lo pide, no antes:
 * con tres se cubren los casos reales de una coordinacion de 5 personas.
 */
export interface User {
  id: string
  email: string
  passwordHash: string
  name: string
  role: Role
  active: boolean
  /** Invalida los tokens emitidos al cambiar la password o dar de baja. */
  tokenVersion: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Lo que sale del dominio hacia afuera. `passwordHash` no viaja NUNCA, ni al
 * frontend ni a un log: el tipo lo impide en vez de confiar en que cada
 * serializador se acuerde de sacarlo.
 */
export type PublicUser = Omit<User, 'passwordHash' | 'tokenVersion'>

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, tokenVersion: _tokenVersion, ...publicUser } = user
  return publicUser
}
