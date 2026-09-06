import type { IUserRepository } from '../../domain/repositories/IUserRepository.js'
import { UserDeactivationResult } from '../../domain/repositories/IUserRepository.js'
import { Role } from '../../generated/prisma/enums.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toUser } from '../mappers/userMappers.js'

/**
 * Usuarios del sistema. Tres roles y nada mas hasta que duela (D14).
 */
export function createPrismaUserRepository(context: PrismaContext): IUserRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.user.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toUser(row)
    },

    async findByEmailForAuthentication(email) {
      // NO filtra por `active` a proposito: el caso de uso necesita poder
      // distinguir "usuario dado de baja" de "contrasena incorrecta". Filtrar
      // aca los volveria el mismo mensaje y nadie sabria por que no entra.
      const row = await executor.user.findFirst({ where: { email, deletedAt: null } })
      return row === null ? null : toUser(row)
    },

    async listActive() {
      const rows = await executor.user.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toUser)
    },

    async create(user) {
      const row = await withDomainErrors(() => executor.user.create({ data: user }))
      return toUser(row)
    },

    async changePassword(id, passwordHash) {
      // El hash y `tokenVersion` van en la MISMA escritura: cambiar la
      // contrasena sin invalidar los tokens emitidos deja adentro al que se los
      // robo, que es exactamente el escenario por el que alguien la cambia.
      await withDomainErrors(() =>
        executor.user.update({
          where: { id },
          data: { passwordHash, tokenVersion: { increment: 1 } },
        }),
      )
    },

    async deactivateSafely(id) {
      return context.atomically(async (transaction) => {
        // Este lock serializa todas las escrituras sobre usuarios durante la
        // decisión. Dos bajas de ADMIN no pueden observar el mismo conteo.
        await transaction.$executeRaw`LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE`

        const user = await transaction.user.findFirst({ where: { id, deletedAt: null } })
        if (user === null) return UserDeactivationResult.NOT_FOUND
        if (!user.active) return UserDeactivationResult.ALREADY_INACTIVE

        if (user.role === Role.ADMIN) {
          const activeAdmins = await transaction.user.count({
            where: { role: Role.ADMIN, active: true, deletedAt: null },
          })
          if (activeAdmins <= 1) return UserDeactivationResult.LAST_ADMIN
        }

        await withDomainErrors(() =>
          transaction.user.update({
            where: { id },
            data: { active: false, tokenVersion: { increment: 1 } },
          }),
        )
        return UserDeactivationResult.DEACTIVATED
      })
    },
  }
}
