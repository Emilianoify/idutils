import type { CloseReason } from '../../generated/prisma/enums.js'
import type { IHomeCareEpisodeRepository } from '../../domain/repositories/IHomeCareEpisodeRepository.js'
import type { PrismaContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { toHomeCareEpisode } from '../mappers/episodeMappers.js'

/**
 * Episodios de internacion domiciliaria (D9).
 *
 * El no solapamiento NO se valida aca: lo garantiza la constraint EXCLUDE de
 * `core_invariants.sql`. Este repositorio deja que la base rechace y
 * `withDomainErrors` traduce; una validacion previa en TypeScript seria una
 * segunda regla que se puede saltear desde un script.
 */
export function createPrismaHomeCareEpisodeRepository(
  context: PrismaContext,
): IHomeCareEpisodeRepository {
  const { executor } = context

  /**
   * El ultimo episodio de cada paciente, por `startsOn`.
   *
   * Se necesita para las bandejas: un episodio cerrado deja al paciente
   * pendiente SOLO si no hay uno posterior. Sin esto, un paciente que ya
   * reingreso seguiria figurando en "esperando alta" para siempre.
   */
  async function latestStartByPatient(): Promise<Map<string, number>> {
    const groups = await executor.homeCareEpisode.groupBy({
      by: ['patientId'],
      where: { deletedAt: null },
      _max: { startsOn: true },
    })

    const latest = new Map<string, number>()
    for (const group of groups) {
      const startsOn = group._max.startsOn
      if (startsOn !== null) latest.set(group.patientId, startsOn.getTime())
    }

    return latest
  }

  return {
    async findById(id) {
      const row = await executor.homeCareEpisode.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toHomeCareEpisode(row)
    },

    async listByPatient(patientId) {
      // TODOS, no solo los abiertos: `statusAt` y los dias efectivos de ID se
      // calculan sobre la historia completa.
      const rows = await executor.homeCareEpisode.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { startsOn: 'asc' },
      })

      return rows.map(toHomeCareEpisode)
    },

    async findOpenByPatient(patientId) {
      const row = await executor.homeCareEpisode.findFirst({
        where: { patientId, endsOn: null, deletedAt: null },
      })

      return row === null ? null : toHomeCareEpisode(row)
    },

    async create(episode) {
      const row = await withDomainErrors(() => executor.homeCareEpisode.create({ data: episode }))
      return toHomeCareEpisode(row)
    },

    async close(id, input) {
      const row = await withDomainErrors(() =>
        executor.homeCareEpisode.update({
          where: { id },
          data: {
            endsOn: input.endsOn,
            closeReason: input.closeReason,
            closeNote: input.closeNote ?? null,
          },
        }),
      )

      return toHomeCareEpisode(row)
    },

    async listOpenStartedAt(date) {
      // Abierto Y YA COMENZADO: un episodio que arranca el jueves existe hoy
      // pero el paciente todavia no esta activo.
      const rows = await executor.homeCareEpisode.findMany({
        where: { endsOn: null, startsOn: { lte: date }, deletedAt: null },
        orderBy: { startsOn: 'asc' },
      })

      return rows.map(toHomeCareEpisode)
    },

    async listPendingByCloseReason(reasons: readonly CloseReason[]) {
      const [candidates, latest] = await Promise.all([
        executor.homeCareEpisode.findMany({
          where: {
            deletedAt: null,
            endsOn: { not: null },
            closeReason: { in: [...reasons] },
          },
          orderBy: { endsOn: 'desc' },
        }),
        latestStartByPatient(),
      ])

      return candidates
        .filter((row) => latest.get(row.patientId) === row.startsOn.getTime())
        .map(toHomeCareEpisode)
    },
  }
}
