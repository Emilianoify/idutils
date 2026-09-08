import {
  AuthorizationCreateFailure,
  type GuardedAuthorizationCreateResult,
  type IAuthorizationRepository,
} from '../../domain/repositories/IAuthorizationRepository.js'
import { episodeIsClosedAt } from '../../domain/services/episodeTimeline.js'
import type { FrequencyUnit } from '../../generated/prisma/enums.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toAuthorization } from '../mappers/episodeMappers.js'

interface CareServiceGuardRow {
  episodeId: string
  specialtyId: string
  endedOn: Date | null
  deletedAt: Date | null
}

interface EpisodeGuardRow {
  endsOn: Date | null
  deletedAt: Date | null
}

interface FrequencyGuardRow {
  amount: number
  unit: FrequencyUnit
  active: boolean
  deletedAt: Date | null
}

interface RelationshipGuardRow {
  deletedAt: Date | null
}

/**
 * Una fila por periodo autorizado (D10).
 *
 * No hay `update` del periodo a proposito: renovar es CREAR otra fila. Pisar
 * `validUntil` borraria la linea de tiempo con la que se defiende una auditoria
 * y con la que se cuenta cuantas veces hubo que reclamar.
 */
export function createPrismaAuthorizationRepository(
  context: PrismaContext,
): IAuthorizationRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.authorization.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toAuthorization(row)
    },

    async listByCareService(careServiceId) {
      const rows = await executor.authorization.findMany({
        where: { careServiceId, deletedAt: null },
        orderBy: { validFrom: 'desc' },
      })

      return rows.map(toAuthorization)
    },

    async create(authorization) {
      const row = await withDomainErrors(() =>
        executor.authorization.create({ data: authorization }),
      )

      return toAuthorization(row)
    },

    async createGuarded(input) {
      return context.atomically(async (transaction): Promise<GuardedAuthorizationCreateResult> => {
        const [careService] = await transaction.$queryRaw<CareServiceGuardRow[]>`
          SELECT "episodeId", "specialtyId", "endedOn", "deletedAt"
          FROM "care_services" /* authorization-create:care-service */
          WHERE "id" = ${input.careServiceId}
          FOR UPDATE
        `
        if (careService === undefined) {
          return { authorization: null, failure: AuthorizationCreateFailure.CARE_SERVICE_NOT_FOUND }
        }
        if (careService.endedOn !== null || careService.deletedAt !== null) {
          return { authorization: null, failure: AuthorizationCreateFailure.CARE_SERVICE_ENDED }
        }

        const [episode] = await transaction.$queryRaw<EpisodeGuardRow[]>`
          SELECT "endsOn", "deletedAt"
          FROM "home_care_episodes" /* authorization-create:episode */
          WHERE "id" = ${careService.episodeId}
          FOR UPDATE
        `
        if (episode === undefined) {
          return { authorization: null, failure: AuthorizationCreateFailure.EPISODE_NOT_FOUND }
        }
        if (episodeIsClosedAt(episode.endsOn, input.asOf) || episode.deletedAt !== null) {
          return { authorization: null, failure: AuthorizationCreateFailure.EPISODE_CLOSED }
        }

        const [frequency] = await transaction.$queryRaw<FrequencyGuardRow[]>`
          SELECT "amount", "unit", "active", "deletedAt"
          FROM "frequencies" /* authorization-create:frequency */
          WHERE "id" = ${input.frequencyId}
          FOR UPDATE
        `
        if (frequency === undefined || frequency.deletedAt !== null) {
          return { authorization: null, failure: AuthorizationCreateFailure.FREQUENCY_NOT_FOUND }
        }
        if (!frequency.active) {
          return { authorization: null, failure: AuthorizationCreateFailure.FREQUENCY_INACTIVE }
        }

        const [relationship] = await transaction.$queryRaw<RelationshipGuardRow[]>`
          SELECT "deletedAt"
          FROM "specialty_frequencies" /* authorization-create:specialty-frequency */
          WHERE "specialtyId" = ${careService.specialtyId}
            AND "frequencyId" = ${input.frequencyId}
          FOR UPDATE
        `
        if (relationship === undefined || relationship.deletedAt !== null) {
          return {
            authorization: null,
            failure: AuthorizationCreateFailure.FREQUENCY_NOT_ELIGIBLE,
          }
        }

        if (input.validUntil.getTime() < input.validFrom.getTime()) {
          return { authorization: null, failure: AuthorizationCreateFailure.INVALID_PERIOD }
        }

        const row = await withDomainErrors(() =>
          transaction.authorization.create({
            data: {
              careServiceId: input.careServiceId,
              frequencyId: input.frequencyId,
              frequencyAmount: frequency.amount,
              frequencyUnit: frequency.unit,
              validFrom: input.validFrom,
              validUntil: input.validUntil,
              notes: input.notes,
            },
          }),
        )

        return { authorization: toAuthorization(row), failure: null }
      })
    },

    async markClaimed(id, claimedAt) {
      // Reclamar NO autoriza: la autorizacion nueva nace cuando la empresa la
      // otorga. Confundirlos es como el sistema termina diciendo que algo esta
      // autorizado porque alguien mando un WhatsApp.
      const row = await withDomainErrors(() =>
        executor.authorization.update({ where: { id }, data: { claimedAt } }),
      )

      return toAuthorization(row)
    },
  }
}
