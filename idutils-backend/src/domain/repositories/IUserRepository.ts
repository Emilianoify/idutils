import type { User } from '../entities/userEntity.js'

export type NewUser = Omit<
  User,
  'id' | 'tokenVersion' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export const UserDeactivationResult = {
  DEACTIVATED: 'DEACTIVATED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_INACTIVE: 'ALREADY_INACTIVE',
  LAST_ADMIN: 'LAST_ADMIN',
} as const

export type UserDeactivationResult =
  (typeof UserDeactivationResult)[keyof typeof UserDeactivationResult]

export interface IUserRepository {
  findById(id: string): Promise<User | null>

  /**
   * Devuelve el usuario COMPLETO, con `passwordHash`. Es el unico lugar del
   * sistema que lo necesita: verificar la contrasena al iniciar sesion.
   *
   * Todo lo demas trabaja con `PublicUser`, donde el hash directamente no
   * existe como campo. El tipo evita que se filtre; no la disciplina de
   * acordarse de sacarlo en cada serializador.
   */
  findByEmailForAuthentication(email: string): Promise<User | null>

  listActive(): Promise<User[]>
  create(user: NewUser): Promise<User>

  /**
   * Cambia el hash e incrementa `tokenVersion` en la misma operacion.
   *
   * Van juntos a proposito: cambiar la contrasena sin invalidar los tokens
   * emitidos deja al que se los robo adentro, que es exactamente el escenario
   * por el que alguien cambia la contrasena.
   */
  changePassword(id: string, passwordHash: string): Promise<void>

  /**
   * Da de baja e invalida sus tokens sin permitir que desaparezca el último
   * ADMIN activo. La comprobación y la escritura son una sola operación atómica.
   */
  deactivateSafely(id: string): Promise<UserDeactivationResult>
}
