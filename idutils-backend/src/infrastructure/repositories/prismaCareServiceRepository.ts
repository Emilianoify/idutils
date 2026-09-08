import {
  CareServiceCreateFailure,
  type GuardedCareServiceCreateResult,
  type ICareServiceRepository,
} from '../../domain/repositories/ICareServiceRepository.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toCareService, toCareServiceWithAuthorizations } from '../mappers/episodeMappers.js'

interface AffiliationGuardRow {
  insuranceProviderId: string
  to: Date | null
  deletedAt: Date | null
}

interface EpisodeGuardRow {
  affiliationId: string
  endsOn: Date | null
  deletedAt: Date | null
}

interface CatalogGuardRow {
  active: boolean
  deletedAt: Date | null
}

interface RelationshipGuardRow {
  deletedAt: Date | null
}

/**
 * La prestacion: la entidad central del sistema (D6).
 *
 * `listActiveWithAuthorizations` trae las autorizaciones enteras y NO calcula
 * vencimientos. La regla vive en `coverageAt` y se aplica una sola vez; una
 * query que decidiera "por vencer" seria una segunda implementacion de la
 * regla mas importante del sistema.
 */
export function createPrismaCareServiceRepository(context: PrismaContext): ICareServiceRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.careService.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toCareService(row)
    },

    async listByEpisode(episodeId) {
      const rows = await executor.careService.findMany({
        where: { episodeId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })

      return rows.map(toCareService)
    },

    async listActiveWithAuthorizations(asOf) {
      const rows = await executor.careService.findMany({
        where: {
          deletedAt: null,
          endedOn: null,
          /**
           * Activa = el episodio CUBRE la fecha, no "no tiene cierre".
           *
           * El rango es semiabierto '[)', el mismo que usa `currentEpisodeAt`
           * para decidir si el paciente esta activo. Preguntar `endsOn: null`
           * dejaba afuera al episodio con cierre PROGRAMADO: cerrar el 7/9
           * estando a 6/9 es avisar que el paciente se va el jueves, y hasta
           * el jueves se le sigue prestando. Ese paciente aparecia ACTIVO en su
           * ficha y su prestacion por vencer no llegaba al tablero — que es
           * justo el reclamo que el sistema existe para no perder.
           */
          episode: {
            deletedAt: null,
            startsOn: { lte: asOf },
            OR: [{ endsOn: null }, { endsOn: { gt: asOf } }],
          },
        },
        include: {
          authorizations: {
            where: { deletedAt: null },
            orderBy: { validFrom: 'desc' },
          },
        },
      })

      return rows.map(toCareServiceWithAuthorizations)
    },

    async create(careService) {
      const row = await withDomainErrors(() => executor.careService.create({ data: careService }))
      return toCareService(row)
    },

    async createGuarded(input) {
      return context.atomically(async (transaction): Promise<GuardedCareServiceCreateResult> => {
        const { careService, affiliationId, insuranceProviderId } = input

        // El orden es global y estable: afiliación, episodio, catálogos y relaciones.
        // Así dos altas equivalentes nunca adquieren los mismos locks al revés.
        const [affiliation] = await transaction.$queryRaw<AffiliationGuardRow[]>`
          SELECT "insuranceProviderId", "to", "deletedAt"
          FROM "affiliations"
          WHERE "id" = ${affiliationId}
          FOR UPDATE
        `
        if (affiliation === undefined || affiliation.deletedAt !== null) {
          return { careService: null, failure: CareServiceCreateFailure.AFFILIATION_NOT_FOUND }
        }
        if (affiliation.to !== null) {
          return { careService: null, failure: CareServiceCreateFailure.AFFILIATION_NOT_CURRENT }
        }
        if (affiliation.insuranceProviderId !== insuranceProviderId) {
          return { careService: null, failure: CareServiceCreateFailure.COMPANY_PROVIDER_MISSING }
        }

        const [episode] = await transaction.$queryRaw<EpisodeGuardRow[]>`
          SELECT "affiliationId", "endsOn", "deletedAt"
          FROM "home_care_episodes"
          WHERE "id" = ${careService.episodeId}
          FOR UPDATE
        `
        if (episode === undefined || episode.deletedAt !== null) {
          return { careService: null, failure: CareServiceCreateFailure.EPISODE_NOT_FOUND }
        }
        if (episode.affiliationId !== affiliationId) {
          return { careService: null, failure: CareServiceCreateFailure.AFFILIATION_NOT_FOUND }
        }
        if (episode.endsOn !== null) {
          return { careService: null, failure: CareServiceCreateFailure.EPISODE_CLOSED }
        }

        const [specialty] = await transaction.$queryRaw<CatalogGuardRow[]>`
          SELECT "active", "deletedAt"
          FROM "specialties" /* care-service-create:specialty */
          WHERE "id" = ${careService.specialtyId}
          FOR UPDATE
        `
        if (specialty === undefined || specialty.deletedAt !== null) {
          return { careService: null, failure: CareServiceCreateFailure.SPECIALTY_NOT_FOUND }
        }
        if (!specialty.active) {
          return { careService: null, failure: CareServiceCreateFailure.SPECIALTY_INACTIVE }
        }

        const [company] = await transaction.$queryRaw<CatalogGuardRow[]>`
          SELECT "active", "deletedAt"
          FROM "contracting_companies"
          WHERE "id" = ${careService.contractingCompanyId}
          FOR UPDATE
        `
        if (company === undefined || company.deletedAt !== null) {
          return { careService: null, failure: CareServiceCreateFailure.COMPANY_NOT_FOUND }
        }
        if (!company.active) {
          return { careService: null, failure: CareServiceCreateFailure.COMPANY_INACTIVE }
        }

        if (careService.professionalId !== null) {
          const [professional] = await transaction.$queryRaw<CatalogGuardRow[]>`
            SELECT "active", "deletedAt"
            FROM "professionals"
            WHERE "id" = ${careService.professionalId}
            FOR UPDATE
          `
          if (professional === undefined || professional.deletedAt !== null) {
            return { careService: null, failure: CareServiceCreateFailure.PROFESSIONAL_NOT_FOUND }
          }
          if (!professional.active) {
            return { careService: null, failure: CareServiceCreateFailure.PROFESSIONAL_INACTIVE }
          }
        }

        const [companyProvider] = await transaction.$queryRaw<RelationshipGuardRow[]>`
          SELECT "deletedAt"
          FROM "company_insurance_providers" /* care-service-create:company-provider */
          WHERE "contractingCompanyId" = ${careService.contractingCompanyId}
            AND "insuranceProviderId" = ${affiliation.insuranceProviderId}
          FOR UPDATE
        `
        if (companyProvider === undefined || companyProvider.deletedAt !== null) {
          return { careService: null, failure: CareServiceCreateFailure.COMPANY_PROVIDER_MISSING }
        }

        if (careService.professionalId !== null) {
          const [professionalSpecialty] = await transaction.$queryRaw<RelationshipGuardRow[]>`
            SELECT "deletedAt"
            FROM "professional_specialties" /* care-service-create:professional-specialty */
            WHERE "professionalId" = ${careService.professionalId}
              AND "specialtyId" = ${careService.specialtyId}
            FOR UPDATE
          `
          if (professionalSpecialty === undefined || professionalSpecialty.deletedAt !== null) {
            return {
              careService: null,
              failure: CareServiceCreateFailure.PROFESSIONAL_SPECIALTY_MISSING,
            }
          }
        }

        const row = await withDomainErrors(() =>
          transaction.careService.create({ data: careService }),
        )
        return { careService: toCareService(row), failure: null }
      })
    },

    async assignProfessional(id, professionalId, specialtyId) {
      const professionalGuard =
        professionalId === null
          ? {}
          : {
              professional: {
                is: {
                  id: professionalId,
                  active: true,
                  deletedAt: null,
                  specialties: { some: { specialtyId, deletedAt: null } },
                },
              },
            }

      return context.atomically(async (transaction) => {
        const result = await withDomainErrors(() =>
          transaction.careService.updateMany({
            where: {
              id,
              specialtyId,
              endedOn: null,
              deletedAt: null,
              episode: { endsOn: null, deletedAt: null },
              ...professionalGuard,
            },
            data: { professionalId },
          }),
        )
        if (result.count !== 1) return null

        const row = await transaction.careService.findUnique({ where: { id } })
        return row === null ? null : toCareService(row)
      })
    },

    async end(id, endedOn) {
      // Baja individual: el episodio sigue abierto y las demas prestaciones
      // siguen corriendo.
      return context.atomically(async (transaction) => {
        const result = await withDomainErrors(() =>
          transaction.careService.updateMany({
            where: {
              id,
              endedOn: null,
              deletedAt: null,
              episode: { startsOn: { lte: endedOn }, endsOn: null, deletedAt: null },
            },
            data: { endedOn },
          }),
        )
        if (result.count !== 1) return null

        const row = await transaction.careService.findUnique({ where: { id } })
        return row === null ? null : toCareService(row)
      })
    },

    async listInsuranceProviderIdsForCompany(contractingCompanyId) {
      const rows = await executor.companyInsuranceProvider.findMany({
        where: { contractingCompanyId, deletedAt: null },
        select: { insuranceProviderId: true },
      })

      return rows.map((row) => row.insuranceProviderId)
    },
  }
}
