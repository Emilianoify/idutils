import { CloseReason } from '../../generated/prisma/enums.js'
import type {
  HomeCareEpisode,
  HospitalizationPeriod,
} from '../entities/homeCareEpisodeEntity.js'
import { addDays, daysBetweenDateOnly, maxDate, minDate } from '../../shared/helpers/dateOnly.js'

/**
 * Lo que se lee entre los episodios (D9, consecuencia 2 y "lo que se deriva").
 *
 * Un ano de Juan Perez con tres internaciones son cuatro episodios y tres
 * huecos. Los huecos no se guardan: se calculan. Y los dias efectivos de ID no
 * son `hasta - desde`, son la suma de los cuatro episodios. Ese delta es lo que
 * el Excel no puede calcular y lo que se discute al facturar.
 */

/** Rango de fechas con ambos extremos INCLUSIVE, como lo pide un humano. */
export interface DateRange {
  from: Date
  to: Date
}

function liveEpisodesSorted(episodes: readonly HomeCareEpisode[]): HomeCareEpisode[] {
  return episodes
    .filter((episode) => episode.deletedAt === null)
    .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())
}

/**
 * Los periodos de internacion en sanatorio: el hueco entre un episodio cerrado
 * con INTERNACION y el siguiente.
 *
 * No hay entidad "internacion" ni la va a haber. El motivo de cierre es lo que
 * califica el hueco: sin el, un hueco podria ser una internacion, una baja o un
 * cambio de obra social.
 *
 * `to === null` es una internacion EN CURSO. No lleva fecha estimada de retorno
 * a proposito (D9): nadie sabe cuando vuelve, se llenaria con inventos y la
 * lista se pudre. La bandeja de internados es sin fecha hasta que avisan.
 */
export function hospitalizationPeriods(
  episodes: readonly HomeCareEpisode[],
): HospitalizationPeriod[] {
  const sorted = liveEpisodesSorted(episodes)

  return sorted.flatMap((episode, index) => {
    if (episode.endsOn === null || episode.closeReason !== CloseReason.INTERNACION) {
      return []
    }

    const from = episode.endsOn
    const next = sorted[index + 1]
    const to = next?.startsOn ?? null

    return [
      {
        from,
        to,
        days: to === null ? null : daysBetweenDateOnly(from, to),
        note: episode.closeNote,
      },
    ]
  })
}

/**
 * Dias efectivos de internacion domiciliaria dentro de un rango.
 *
 * Suma de las intersecciones de cada episodio con el rango. NO es
 * `hasta - desde`: si el paciente estuvo internado tres veces, esos dias no
 * son dias de ID y no se facturan.
 *
 * OJO CON EL RANGO: `from` y `to` son ambos inclusive. Un episodio ABIERTO
 * cuenta hasta el final del rango, asi que pedir "del 1/1 al 31/12" en agosto
 * devuelve tambien los dias que todavia no pasaron. Si lo que se quiere es
 * "hasta hoy", el `to` tiene que ser hoy. La funcion no adivina cual de las dos
 * preguntas es: son distintas y las dos son legitimas.
 */
export function effectiveCareDays(
  episodes: readonly HomeCareEpisode[],
  range: DateRange,
): number {
  if (range.to.getTime() < range.from.getTime()) {
    throw new RangeError('El rango termina antes de empezar')
  }

  // Internamente se trabaja semiabierto [from, to+1) para que coincida con el
  // rango de los episodios y con la constraint EXCLUDE de la base.
  const rangeEndExclusive = addDays(range.to, 1)

  return liveEpisodesSorted(episodes).reduce((total, episode) => {
    const start = maxDate(episode.startsOn, range.from)
    const endExclusive = minDate(episode.endsOn ?? rangeEndExclusive, rangeEndExclusive)
    const days = daysBetweenDateOnly(start, endExclusive)

    return total + Math.max(0, days)
  }, 0)
}

/**
 * Cuantas veces se interrumpio la ID en el rango. Es el numero de internaciones
 * cerradas mas la que este en curso: se cuentan los huecos, no los episodios.
 */
export function interruptionCount(episodes: readonly HomeCareEpisode[]): number {
  return hospitalizationPeriods(episodes).length
}
