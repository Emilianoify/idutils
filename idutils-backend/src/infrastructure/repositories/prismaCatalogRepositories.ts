import type {
  IContractingCompanyRepository,
  IFrequencyRepository,
  IInsuranceProviderRepository,
  ILocalityRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../domain/repositories/ICatalogRepository.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toContractingCompany, toInsuranceProvider } from '../mappers/coverageMappers.js'
import {
  toFrequency,
  toLocality,
  toProfessional,
  toProvince,
  toSpecialty,
} from '../mappers/catalogMappers.js'

/**
 * Los catalogos que alimentan los selectores.
 *
 * Ninguno tiene `delete`: hay autorizaciones apuntando a una frecuencia y
 * prestaciones apuntando a una especialidad. Se desactiva, no se borra (D11).
 *
 * Las tablas de union (empresa-obra social, especialidad-frecuencia,
 * profesional-especialidad) se dan de baja logica y se REVIVEN al volver a
 * vincular, en vez de crear una fila nueva: el `@@unique` del schema es total,
 * y una fila con `deletedAt` seteado bloquearia el alta siguiente.
 */

export function createPrismaSpecialtyRepository(context: PrismaContext): ISpecialtyRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.specialty.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toSpecialty(row)
    },

    async listActive() {
      const rows = await executor.specialty.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toSpecialty)
    },

    async create(specialty) {
      const row = await withDomainErrors(() => executor.specialty.create({ data: specialty }))
      return toSpecialty(row)
    },

    async update(id, changes) {
      const row = await withDomainErrors(() =>
        executor.specialty.update({ where: { id }, data: changes }),
      )

      return toSpecialty(row)
    },

    async deactivate(id) {
      await withDomainErrors(() =>
        executor.specialty.update({ where: { id }, data: { active: false } }),
      )
    },
  }
}

export function createPrismaFrequencyRepository(context: PrismaContext): IFrequencyRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.frequency.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toFrequency(row)
    },

    async listActive() {
      const rows = await executor.frequency.findMany({
        where: { active: true, deletedAt: null },
        orderBy: [{ unit: 'asc' }, { amount: 'asc' }],
      })

      return rows.map(toFrequency)
    },

    async listEligibleForSpecialty(specialtyId) {
      // NO se filtra por `active` a proposito. El dominio distingue "no
      // elegible para esta especialidad" de "dada de baja en el catalogo", y
      // son dos mensajes distintos para el operador. Filtrar aca convertiria
      // una frecuencia desactivada en "no elegible", que manda a corregir lo
      // que no esta mal.
      const rows = await executor.frequency.findMany({
        where: {
          deletedAt: null,
          specialties: { some: { specialtyId, deletedAt: null } },
        },
        orderBy: [{ unit: 'asc' }, { amount: 'asc' }],
      })

      return rows.map(toFrequency)
    },

    async create(frequency) {
      const row = await withDomainErrors(() => executor.frequency.create({ data: frequency }))
      return toFrequency(row)
    },

    async deactivate(id) {
      // Editar es crear nueva y desactivar la vieja: cambiar `amount` en el
      // lugar reescribiria lo que se autorizo el mes pasado (D11).
      await withDomainErrors(() =>
        executor.frequency.update({ where: { id }, data: { active: false } }),
      )
    },

    async linkToSpecialty(specialtyId, frequencyId) {
      await withDomainErrors(() =>
        executor.specialtyFrequency.upsert({
          where: { specialtyId_frequencyId: { specialtyId, frequencyId } },
          create: { specialtyId, frequencyId },
          update: { deletedAt: null },
        }),
      )
    },

    async unlinkFromSpecialty(specialtyId, frequencyId) {
      await withDomainErrors(() =>
        executor.specialtyFrequency.updateMany({
          where: { specialtyId, frequencyId, deletedAt: null },
          data: { deletedAt: new Date() },
        }),
      )
    },
  }
}

export function createPrismaProfessionalRepository(
  context: PrismaContext,
): IProfessionalRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.professional.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toProfessional(row)
    },

    async listActive() {
      const rows = await executor.professional.findMany({
        where: { active: true, deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })

      return rows.map(toProfessional)
    },

    async listActiveBySpecialty(specialtyId) {
      const rows = await executor.professional.findMany({
        where: {
          active: true,
          deletedAt: null,
          specialties: { some: { specialtyId, deletedAt: null } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })

      return rows.map(toProfessional)
    },

    async listSpecialtyIds(professionalId) {
      const rows = await executor.professionalSpecialty.findMany({
        where: { professionalId, deletedAt: null },
        select: { specialtyId: true },
      })

      return rows.map((row) => row.specialtyId)
    },

    async create(professional) {
      const row = await withDomainErrors(() =>
        executor.professional.create({ data: professional }),
      )

      return toProfessional(row)
    },

    async update(id, changes) {
      const row = await withDomainErrors(() =>
        executor.professional.update({ where: { id }, data: changes }),
      )

      return toProfessional(row)
    },

    async setSpecialties(professionalId, specialtyIds) {
      // Reemplazo completo, atomico: entre "borre las viejas" y "cargue las
      // nuevas" el profesional quedaria sin ninguna especialidad, y una
      // prestacion creada en ese instante seria rechazada por una regla que en
      // realidad se cumple.
      await context.atomically(async (transaction) => {
        await withDomainErrors(() =>
          transaction.professionalSpecialty.updateMany({
            where: { professionalId, specialtyId: { notIn: [...specialtyIds] }, deletedAt: null },
            data: { deletedAt: new Date() },
          }),
        )

        for (const specialtyId of specialtyIds) {
          await withDomainErrors(() =>
            transaction.professionalSpecialty.upsert({
              where: { professionalId_specialtyId: { professionalId, specialtyId } },
              create: { professionalId, specialtyId },
              update: { deletedAt: null },
            }),
          )
        }
      })
    },
  }
}

export function createPrismaContractingCompanyRepository(
  context: PrismaContext,
): IContractingCompanyRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.contractingCompany.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toContractingCompany(row)
    },

    async listActive() {
      const rows = await executor.contractingCompany.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toContractingCompany)
    },

    async listActiveByInsuranceProvider(insuranceProviderId) {
      // El selector correcto por D2: las empresas que LLEGAN a esa obra social.
      // Ofrecer todas deja cargar una prestacion que despues no se le puede
      // facturar a nadie.
      const rows = await executor.contractingCompany.findMany({
        where: {
          active: true,
          deletedAt: null,
          insuranceProviders: { some: { insuranceProviderId, deletedAt: null } },
        },
        orderBy: { name: 'asc' },
      })

      return rows.map(toContractingCompany)
    },

    async create(company) {
      const row = await withDomainErrors(() =>
        executor.contractingCompany.create({ data: company }),
      )

      return toContractingCompany(row)
    },

    async setInsuranceProviders(contractingCompanyId, insuranceProviderIds) {
      await context.atomically(async (transaction) => {
        await withDomainErrors(() =>
          transaction.companyInsuranceProvider.updateMany({
            where: {
              contractingCompanyId,
              insuranceProviderId: { notIn: [...insuranceProviderIds] },
              deletedAt: null,
            },
            data: { deletedAt: new Date() },
          }),
        )

        for (const insuranceProviderId of insuranceProviderIds) {
          await withDomainErrors(() =>
            transaction.companyInsuranceProvider.upsert({
              where: {
                contractingCompanyId_insuranceProviderId: {
                  contractingCompanyId,
                  insuranceProviderId,
                },
              },
              create: { contractingCompanyId, insuranceProviderId },
              update: { deletedAt: null },
            }),
          )
        }
      })
    },
  }
}

export function createPrismaInsuranceProviderRepository(
  context: PrismaContext,
): IInsuranceProviderRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.insuranceProvider.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toInsuranceProvider(row)
    },

    async listActive() {
      const rows = await executor.insuranceProvider.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toInsuranceProvider)
    },

    async listReachable() {
      // La cobertura de la coordinacion es DERIVADA (D2): solo las obras
      // sociales alcanzadas por alguna empresa activa con convenio vigente.
      const rows = await executor.insuranceProvider.findMany({
        where: {
          active: true,
          deletedAt: null,
          companies: {
            some: {
              deletedAt: null,
              contractingCompany: { active: true, deletedAt: null },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      return rows.map(toInsuranceProvider)
    },

    async create(provider) {
      const row = await withDomainErrors(() =>
        executor.insuranceProvider.create({ data: provider }),
      )

      return toInsuranceProvider(row)
    },
  }
}

export function createPrismaLocalityRepository(context: PrismaContext): ILocalityRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.locality.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toLocality(row)
    },

    async findProvinceById(id) {
      const row = await executor.province.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toProvince(row)
    },

    async listProvinces() {
      const rows = await executor.province.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toProvince)
    },

    async listByProvince(provinceId) {
      const rows = await executor.locality.findMany({
        where: { provinceId, deletedAt: null },
        orderBy: { name: 'asc' },
      })

      return rows.map(toLocality)
    },

    async search(text, limit) {
      const rows = await executor.locality.findMany({
        where: { deletedAt: null, name: { contains: text, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: limit,
      })

      return rows.map(toLocality)
    },

    async create(locality) {
      // El `@@unique([provinceId, name])` del schema es el que impide dos
      // Caballito en la misma provincia. Se deja fallar a la base y se traduce,
      // en vez de consultar antes: entre la consulta y el insert hay una
      // ventana, y la constraint no la tiene.
      const row = await withDomainErrors(() => executor.locality.create({ data: locality }))

      return toLocality(row)
    },
  }
}
