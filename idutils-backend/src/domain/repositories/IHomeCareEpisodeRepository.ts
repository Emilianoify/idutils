import type { CloseReason } from '../../generated/prisma/enums.js'
import type { HomeCareEpisode } from '../entities/homeCareEpisodeEntity.js'

export type NewHomeCareEpisode = Omit<
  HomeCareEpisode,
  'id' | 'endsOn' | 'closeReason' | 'closeNote' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export interface CloseEpisodeInput {
  endsOn: Date
  closeReason: CloseReason
  closeNote?: string
}

export interface IHomeCareEpisodeRepository {
  findById(id: string): Promise<HomeCareEpisode | null>

  /**
   * TODOS los episodios del paciente, ordenados por `startsOn`.
   *
   * Todos, no solo los abiertos: `statusAt` y los dias efectivos de ID se
   * calculan sobre la historia completa. Un repositorio que filtre por "activo"
   * aca rompe la auditoria sin que nadie lo note, porque la respuesta sigue
   * pareciendo razonable.
   */
  listByPatient(patientId: string): Promise<HomeCareEpisode[]>

  /** El abierto del paciente, o null. Como maximo hay uno: lo garantiza el EXCLUDE. */
  findOpenByPatient(patientId: string): Promise<HomeCareEpisode | null>

  /**
   * `startsOn` viene del operador y puede ser futuro. JAMAS `now()`.
   *
   * La base rechaza el solapamiento con la constraint EXCLUDE. Esa violacion
   * hay que traducirla a un mensaje util, no dejarla salir como error de
   * Postgres: el operador tiene que leer "ya hay un episodio abierto desde el
   * 22/1", no un nombre de constraint.
   */
  create(episode: NewHomeCareEpisode): Promise<HomeCareEpisode>

  close(id: string, input: CloseEpisodeInput): Promise<HomeCareEpisode>

  /** Los abiertos y ya comenzados a esa fecha. Es la tarjeta "pacientes activos". */
  listOpenStartedAt(date: Date): Promise<HomeCareEpisode[]>

  /**
   * Los cerrados cuyo motivo los deja en una bandeja pendiente, sin episodio
   * posterior. Es la lista de "esperando alta" y "reautorizar".
   */
  listPendingByCloseReason(reasons: readonly CloseReason[]): Promise<HomeCareEpisode[]>
}
