import type { IAffiliationRepository } from '../../domain/repositories/IAffiliationRepository.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toAffiliation } from '../mappers/coverageMappers.js'

/**
 * Afiliaciones: la cobertura del paciente en el tiempo (D8).
 *
 * `to === null` es "vigente" y no un flag `active`: la fecha de cierre es un
 * dato del negocio que ademas responde desde cuando no esta cubierto. Un
 * booleano lo perderia.
 */
export function createPrismaAffiliationRepository(context: PrismaContext): IAffiliationRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.affiliation.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toAffiliation(row)
    },

    async findCurrentByMemberNumber(insuranceProviderId, memberNumber) {
      // `memberNumber` tiene que llegar YA normalizado. Consultar con el valor
      // crudo no encuentra nada y el sistema deja duplicar en silencio, que es
      // exactamente el problema del Excel.
      const row = await executor.affiliation.findFirst({
        where: { insuranceProviderId, memberNumber, to: null, deletedAt: null },
      })

      return row === null ? null : toAffiliation(row)
    },

    async listByPatient(patientId) {
      const rows = await executor.affiliation.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { from: 'desc' },
      })

      return rows.map(toAffiliation)
    },

    async findCurrentByPatient(patientId) {
      const row = await executor.affiliation.findFirst({
        where: { patientId, to: null, deletedAt: null },
      })

      return row === null ? null : toAffiliation(row)
    },

    async create(affiliation) {
      const row = await withDomainErrors(() => executor.affiliation.create({ data: affiliation }))
      return toAffiliation(row)
    },

    async close(id, to) {
      // Cerrar la afiliacion NO cierra el episodio desde aca: esa coordinacion
      // es de la capa de aplicacion, en una sola transaccion (D9). Un
      // repositorio que cerrara el episodio de prepo esconderia media regla.
      const row = await withDomainErrors(() =>
        executor.affiliation.update({ where: { id }, data: { to } }),
      )

      return toAffiliation(row)
    },

    async softDelete(id) {
      // Libera el par (obra social, N de afiliado): el indice unico parcial
      // filtra por deletedAt, asi que el numero vuelve a estar disponible.
      await withDomainErrors(() =>
        executor.affiliation.update({ where: { id }, data: { deletedAt: new Date() } }),
      )
    },
  }
}
