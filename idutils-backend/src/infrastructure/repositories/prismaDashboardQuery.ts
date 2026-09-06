import type {
  ActiveCareServiceRow,
  IDashboardQuery,
  PendingEpisodeRow,
} from '../../domain/repositories/IDashboardQuery.js'
import { normalizePersistedDateOnly } from '../../shared/helpers/dateOnly.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { toAuthorization } from '../mappers/episodeMappers.js'

/**
 * El lado de LECTURA del dashboard, separado de los repositorios de escritura.
 *
 * Trae las filas ya cruzadas con los nombres porque eso es lo que SQL hace
 * bien: el caso de uso no tiene por que resolver un join a mano paciente por
 * paciente.
 *
 * Lo que NO trae es el veredicto. Ninguna de estas consultas dice "por vencer":
 * eso lo decide `coverageAt` sobre las autorizaciones que vienen adentro. Si la
 * query decidiera, habria dos implementaciones de la regla mas importante del
 * sistema, y el dia que se mueva el umbral van a decir cosas distintas.
 */
export function createPrismaDashboardQuery(context: PrismaContext): IDashboardQuery {
  const { executor } = context

  return {
    async listActiveCareServices(asOf): Promise<ActiveCareServiceRow[]> {
      const rows = await executor.careService.findMany({
        where: {
          deletedAt: null,
          endedOn: null,
          episode: { deletedAt: null, endsOn: null, startsOn: { lte: asOf } },
        },
        include: {
          episode: { include: { patient: true } },
          specialty: true,
          contractingCompany: true,
          professional: true,
          authorizations: { where: { deletedAt: null }, orderBy: { validFrom: 'desc' } },
        },
      })

      return rows.map((row) => ({
        careServiceId: row.id,
        episodeId: row.episodeId,
        patientId: row.episode.patientId,
        patientLastName: row.episode.patient.lastName,
        patientFirstName: row.episode.patient.firstName,
        specialtyId: row.specialtyId,
        specialtyName: row.specialty.name,
        // Viaja el `serviceUnit` y no la etiqueta armada: el sustantivo lo
        // decide `formatFrequency`, en un solo lugar (D11).
        serviceUnit: row.specialty.serviceUnit,
        contractingCompanyId: row.contractingCompanyId,
        contractingCompanyName: row.contractingCompany.name,
        professionalId: row.professionalId,
        professionalLastName: row.professional?.lastName ?? null,
        professionalFirstName: row.professional?.firstName ?? null,
        authorizations: row.authorizations.map(toAuthorization),
      }))
    },

    async countActivePatients(asOf) {
      // Se cuenta sobre EPISODIOS y no sobre las filas de arriba porque un
      // paciente puede estar activo con cero prestaciones cargadas: es un alta
      // a medio hacer, y esconderla del contador es perderla de vista.
      const groups = await executor.homeCareEpisode.groupBy({
        by: ['patientId'],
        where: { deletedAt: null, endsOn: null, startsOn: { lte: asOf } },
      })

      return groups.length
    },

    async listPendingEpisodes(asOf): Promise<PendingEpisodeRow[]> {
      const [closed, latest] = await Promise.all([
        executor.homeCareEpisode.findMany({
          where: {
            deletedAt: null,
            endsOn: { not: null, lte: asOf },
            closeReason: { not: null },
          },
          include: { patient: true },
          orderBy: { endsOn: 'desc' },
        }),
        executor.homeCareEpisode.groupBy({
          by: ['patientId'],
          where: { deletedAt: null },
          _max: { startsOn: true },
        }),
      ])

      // Solo el ULTIMO episodio del paciente deja bandeja pendiente. Sin este
      // corte, un paciente que ya reingreso seguiria figurando en "esperando
      // alta" para siempre, y la bandeja dejaria de significar algo.
      const latestStart = new Map<string, number>()
      for (const group of latest) {
        const startsOn = group._max.startsOn
        if (startsOn !== null) latestStart.set(group.patientId, startsOn.getTime())
      }

      const pending: PendingEpisodeRow[] = []

      for (const row of closed) {
        if (row.endsOn === null || row.closeReason === null) continue
        if (latestStart.get(row.patientId) !== row.startsOn.getTime()) continue

        pending.push({
          episodeId: row.id,
          patientId: row.patientId,
          patientLastName: row.patient.lastName,
          patientFirstName: row.patient.firstName,
          endsOn: normalizePersistedDateOnly(row.endsOn),
          closeReason: row.closeReason,
          closeNote: row.closeNote,
        })
      }

      return pending
    },
  }
}
