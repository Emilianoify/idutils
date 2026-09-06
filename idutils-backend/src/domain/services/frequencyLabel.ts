import type { FrequencyUnit, ServiceUnit } from '../../generated/prisma/enums.js'

/**
 * Como se lee una frecuencia (D11).
 *
 * `2 semanales` es UNA SOLA FILA del catalogo. El sustantivo no es parte de la
 * frecuencia: lo pone la especialidad. La misma fila se lee "2 visitas
 * semanales" para Medico Clinico y "2 sesiones semanales" para Kinesiologia.
 *
 * Si el sustantivo viviera en la frecuencia, el catalogo tendria la misma
 * matematica repetida una vez por especialidad, y agregar enfermeria por
 * turnos de 6/12/24 horas obligaria a duplicarlo entero otra vez. Asi, se
 * agrega HORA al enum de la especialidad y no se toca ninguna frecuencia.
 */

/** Los valores del dominio van en espanol: es la jerga del negocio, no un identificador. */
const NOUN_BY_SERVICE_UNIT: Record<ServiceUnit, { one: string; many: string }> = {
  VISITA: { one: 'visita', many: 'visitas' },
  SESION: { one: 'sesión', many: 'sesiones' },
  HORA: { one: 'hora', many: 'horas' },
}

const CADENCE_BY_FREQUENCY_UNIT: Record<FrequencyUnit, { one: string; many: string }> = {
  SEMANAL: { one: 'semanal', many: 'semanales' },
  MENSUAL: { one: 'mensual', many: 'mensuales' },
}

export interface FrequencyLabelInput {
  amount: number
  unit: FrequencyUnit
}

/**
 * "2 visitas semanales", "1 sesión mensual", "6 horas semanales".
 *
 * Sirve igual para el catalogo (`Frequency`) y para el valor congelado de una
 * autorizacion, porque las dos formas tienen `amount` y `unit`. Es a proposito:
 * la autorizacion vieja se lee con la misma funcion que la frecuencia de hoy, y
 * no hay dos renderizadores que se desincronicen.
 */
export function formatFrequency(
  frequency: FrequencyLabelInput,
  serviceUnit: ServiceUnit,
): string {
  const plural = frequency.amount !== 1
  const noun = NOUN_BY_SERVICE_UNIT[serviceUnit]
  const cadence = CADENCE_BY_FREQUENCY_UNIT[frequency.unit]

  return [
    frequency.amount,
    plural ? noun.many : noun.one,
    plural ? cadence.many : cadence.one,
  ].join(' ')
}
