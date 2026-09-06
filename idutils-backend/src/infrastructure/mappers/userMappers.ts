import type { UserModel as UserRow } from '../../generated/prisma/models.js'
import type { User } from '../../domain/entities/userEntity.js'

/**
 * Devuelve el usuario COMPLETO, con `passwordHash`.
 *
 * Es a proposito y es el unico mapper que lo hace: el repositorio es la unica
 * capa que necesita el hash, para verificar la contrasena al iniciar sesion.
 * De ahi para arriba se viaja como `PublicUser`, donde el campo directamente
 * no existe como propiedad.
 */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role,
    active: row.active,
    tokenVersion: row.tokenVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
