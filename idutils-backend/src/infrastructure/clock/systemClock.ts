import type { IClock } from '../../domain/repositories/IClock.js'
import { todayInBusinessTimeZone } from '../../shared/helpers/dateOnly.js'

/**
 * El "hoy" real del sistema, en hora de Buenos Aires.
 *
 * Es infraestructura y no un helper porque el reloj es un recurso externo, como
 * la base: en los tests se reemplaza por uno fijo y por eso el dominio nunca
 * llama a `new Date()` adentro.
 *
 * Devuelve fecha de negocio a medianoche UTC, no un timestamp: un proceso que
 * corre 01:00 UTC ya es "ayer" para la coordinacion, y el dashboard tiene que
 * coincidir con el calendario de la pared.
 */
export class SystemClock implements IClock {
  today(): Date {
    return todayInBusinessTimeZone()
  }
}
