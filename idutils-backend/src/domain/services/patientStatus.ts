import type { CloseReason } from '../../generated/prisma/enums.js'
import type { HomeCareEpisode } from '../entities/homeCareEpisodeEntity.js'
import { PatientStatus } from '../enums/patientStatus.js'
import { WorkQueue } from '../enums/workQueue.js'
import { episodeIsClosedAt } from './episodeTimeline.js'

/**
 * El estado del paciente, derivado de sus episodios (D9).
 *
 * `Patient.estado` no es una columna. Un flag es un valor barato que alguien se
 * olvida de actualizar; la estructura no se olvida. Y como se deriva de fechas,
 * sale gratis la pregunta de auditoria: que era el paciente el 15 de agosto.
 */

/**
 * Motivo de cierre -> estado del paciente.
 *
 * Es un Record exhaustivo a proposito: el dia que se agregue un CloseReason
 * nuevo al schema, esto NO COMPILA hasta que alguien decida que estado
 * corresponde. Un `switch` con `default` se lo tragaria en silencio, y el
 * paciente aparecerian como EGRESADO sin que nadie lo haya decidido.
 */
const STATUS_BY_CLOSE_REASON: Record<CloseReason, PatientStatus> = {
  INTERNACION: PatientStatus.INTERNADO,
  CAMBIO_OBRA_SOCIAL: PatientStatus.PENDIENTE_REAUTORIZACION,
  FIN_COBERTURA: PatientStatus.PENDIENTE_REAUTORIZACION,
  SUSPENSION_EMPRESA: PatientStatus.PENDIENTE_REAUTORIZACION,
  ALTA_MEDICA: PatientStatus.EGRESADO,
  BAJA_VOLUNTARIA: PatientStatus.EGRESADO,
  MUDANZA_FUERA_DE_ZONA: PatientStatus.EGRESADO,
  FALLECIMIENTO: PatientStatus.FALLECIDO,
}

/** Mismo criterio de exhaustividad para la bandeja de trabajo (D9, consecuencia 3). */
const QUEUE_BY_CLOSE_REASON: Record<CloseReason, WorkQueue> = {
  INTERNACION: WorkQueue.ESPERANDO_ALTA,
  CAMBIO_OBRA_SOCIAL: WorkQueue.REAUTORIZAR,
  FIN_COBERTURA: WorkQueue.REAUTORIZAR,
  SUSPENSION_EMPRESA: WorkQueue.REAUTORIZAR,
  ALTA_MEDICA: WorkQueue.CERRADO,
  BAJA_VOLUNTARIA: WorkQueue.CERRADO,
  MUDANZA_FUERA_DE_ZONA: WorkQueue.CERRADO,
  FALLECIMIENTO: WorkQueue.ARCHIVO,
}

function liveEpisodes(episodes: readonly HomeCareEpisode[]): HomeCareEpisode[] {
  return episodes.filter((episode) => episode.deletedAt === null)
}

/**
 * El episodio vigente a una fecha, o null.
 *
 * El rango es SEMIABIERTO: `[startsOn, endsOn)`. El dia que el episodio cierra
 * el paciente ya no esta en el, que es exactamente lo que declara la constraint
 * EXCLUDE de la base. Si aca fuera cerrado y alla semiabierto, un reingreso el
 * mismo dia pasaria la validacion del dominio y explotaria en el INSERT.
 */
export function currentEpisodeAt(
  episodes: readonly HomeCareEpisode[],
  date: Date,
): HomeCareEpisode | null {
  const at = date.getTime()

  return (
    liveEpisodes(episodes).find(
      (episode) =>
        episode.startsOn.getTime() <= at && !episodeIsClosedAt(episode.endsOn, date),
    ) ?? null
  )
}

/**
 * El ultimo episodio cerrado A ESA FECHA.
 *
 * El `endsOn <= date` es lo que hace que `statusAt` sirva para auditoria y no
 * solo para hoy: sin ese filtro, preguntar por el 15 de agosto leeria el cierre
 * de diciembre y contestaria con informacion que en agosto no existia.
 */
export function lastClosedEpisodeAt(
  episodes: readonly HomeCareEpisode[],
  date: Date,
): HomeCareEpisode | null {
  const closed = liveEpisodes(episodes).filter((episode) =>
    episodeIsClosedAt(episode.endsOn, date),
  )

  if (closed.length === 0) return null

  return closed.reduce((latest, episode) =>
    (episode.endsOn?.getTime() ?? 0) > (latest.endsOn?.getTime() ?? 0) ? episode : latest,
  )
}

/**
 * El PROXIMO episodio en la linea de tiempo despues de esa fecha.
 *
 * El "proximo" es el que empieza antes que los otros, este abierto o cerrado.
 * La distincion importa para `statusAt`: preguntar si existe *algun* episodio
 * abierto mas adelante contesta que si para cualquier fecha del pasado apenas
 * el paciente tenga un episodio abierto hoy, y ahi la auditoria deja de servir.
 */
export function nextEpisodeAfter(
  episodes: readonly HomeCareEpisode[],
  date: Date,
): HomeCareEpisode | null {
  const at = date.getTime()

  const upcoming = liveEpisodes(episodes).filter((episode) => episode.startsOn.getTime() > at)
  if (upcoming.length === 0) return null

  return upcoming.reduce((earliest, episode) =>
    episode.startsOn.getTime() < earliest.startsOn.getTime() ? episode : earliest,
  )
}

/**
 * El estado del paciente a una fecha cualquiera.
 *
 * Con `date = hoy` da el estado actual; con cualquier otra, responde la
 * pregunta de auditoria. Con un flag esa segunda pregunta no se puede
 * responder nunca.
 *
 * SOBRE REINGRESA: mira el SIGUIENTE episodio de la linea de tiempo, y solo
 * cuenta si esta abierto. La version ingenua —"existe algun episodio abierto
 * que empiece despues"— contesta REINGRESA para todo el pasado del paciente en
 * cuanto tenga un episodio abierto hoy, porque ese episodio empieza despues de
 * cualquier fecha vieja. El estado tiene que salir de lo que pasaba entonces,
 * no de lo que pasa ahora.
 *
 * El orden de las preguntas es el de la tabla de D9, y no es casual: un
 * paciente internado con el reingreso ya cargado para el jueves es REINGRESA,
 * no INTERNADO. Esa es la bandeja util.
 */
export function statusAt(episodes: readonly HomeCareEpisode[], date: Date): PatientStatus {
  const live = liveEpisodes(episodes)
  if (live.length === 0) return PatientStatus.SIN_INICIAR

  if (currentEpisodeAt(live, date) !== null) return PatientStatus.ACTIVO

  if (nextEpisodeAfter(live, date)?.endsOn === null) return PatientStatus.REINGRESA

  const lastClosed = lastClosedEpisodeAt(live, date)
  if (lastClosed?.closeReason == null) return PatientStatus.SIN_INICIAR

  return STATUS_BY_CLOSE_REASON[lastClosed.closeReason]
}

/**
 * En que bandeja cae el paciente a esa fecha, o null si no hay nada que hacer.
 *
 * Devuelve null para el paciente activo, para el que reingresa y para el que
 * nunca empezo: la bandeja existe para lo que quedo colgado.
 */
export function workQueueAt(
  episodes: readonly HomeCareEpisode[],
  date: Date,
): WorkQueue | null {
  const status = statusAt(episodes, date)

  if (
    status === PatientStatus.ACTIVO ||
    status === PatientStatus.REINGRESA ||
    status === PatientStatus.SIN_INICIAR
  ) {
    return null
  }

  const lastClosed = lastClosedEpisodeAt(episodes, date)
  if (lastClosed?.closeReason == null) return null

  return QUEUE_BY_CLOSE_REASON[lastClosed.closeReason]
}

/** El motivo de cierre mapeado a bandeja, sin pasar por los episodios. */
export function workQueueForCloseReason(closeReason: CloseReason): WorkQueue {
  return QUEUE_BY_CLOSE_REASON[closeReason]
}
