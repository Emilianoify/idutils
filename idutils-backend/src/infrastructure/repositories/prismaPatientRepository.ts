import type { Prisma } from '../../generated/prisma/client.js'
import type { IPatientRepository } from '../../domain/repositories/IPatientRepository.js'
import { ERROR_MESSAGES } from '../../shared/constants/messages.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toPatient, toPatientContact } from '../mappers/patientMappers.js'

/**
 * El paciente y sus contactos sobre Postgres.
 *
 * `deletedAt: null` esta en TODAS las consultas y no en una vista ni en una
 * extension de Prisma: un filtro invisible es el que alguien se olvida de
 * poner el dia que agrega una consulta, y el paciente dado de baja reaparece
 * en el listado sin que nadie lo note.
 */
export function createPrismaPatientRepository(context: PrismaContext): IPatientRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.patient.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toPatient(row)
    },

    async search(criteria) {
      const where: Prisma.PatientWhereInput = { deletedAt: null }

      if (criteria.localityId !== undefined) {
        where.localityId = criteria.localityId
      }

      // Apellido, nombre o documento: los tres campos con los que el operador
      // reconoce a la persona cuando el numero de afiliado no matcheo (D8).
      if (criteria.text !== undefined && criteria.text.length > 0) {
        where.OR = [
          { lastName: { contains: criteria.text, mode: 'insensitive' } },
          { firstName: { contains: criteria.text, mode: 'insensitive' } },
          { documentNumber: { contains: criteria.text, mode: 'insensitive' } },
        ]
      }

      // El total va aparte y sobre el MISMO where: paginar sin total deja al
      // operador sin saber si vale la pena afinar la busqueda o seguir bajando.
      const [rows, total] = await Promise.all([
        executor.patient.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          skip: criteria.offset,
          take: criteria.limit,
        }),
        executor.patient.count({ where }),
      ])

      return { items: rows.map(toPatient), total }
    },

    async create(patient) {
      const row = await withDomainErrors(() => executor.patient.create({ data: patient }))
      return toPatient(row)
    },

    async update(id, changes) {
      const row = await withDomainErrors(() =>
        executor.patient.update({ where: { id }, data: changes }),
      )
      return toPatient(row)
    },

    async softDelete(id) {
      // Baja logica, nunca DELETE: hay episodios y autorizaciones colgando, y
      // borrarlos seria borrar la historia con la que se defiende una auditoria.
      await withDomainErrors(() =>
        executor.patient.update({ where: { id }, data: { deletedAt: new Date() } }),
      )
    },

    async listContacts(patientId) {
      const rows = await executor.patientContact.findMany({
        where: { patientId, deletedAt: null },
        // El principal primero: es a quien se llama.
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      })

      return rows.map(toPatientContact)
    },

    async addContact(contact) {
      const row = await withDomainErrors(() => executor.patientContact.create({ data: contact }))
      return toPatientContact(row)
    },

    async setPrimaryContact(patientId, contactId) {
      // Los dos pasos van juntos o no van: la base tiene un unique parcial de
      // un solo principal por paciente, y hacerlo suelto deja al paciente sin
      // ninguno si el proceso se corta en el medio.
      await context.atomically(async (transaction) => {
        await withDomainErrors(() =>
          transaction.patientContact.updateMany({
            where: { patientId, isPrimary: true, deletedAt: null },
            data: { isPrimary: false },
          }),
        )

        const promoted = await withDomainErrors(() =>
          transaction.patientContact.updateMany({
            // `patientId` en el where a proposito: sin eso, un id de otro
            // paciente marcaria como principal un contacto ajeno.
            where: { id: contactId, patientId, deletedAt: null },
            data: { isPrimary: true },
          }),
        )

        if (promoted.count === 0) {
          throw new AppError(404, ERROR_MESSAGES.DATABASE.RECORD_NOT_FOUND)
        }
      })
    },
  }
}
