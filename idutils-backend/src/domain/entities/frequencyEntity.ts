import type { FrequencyUnit } from '../../generated/prisma/enums.js'

/**
 * Matematica pura, sin sustantivo: `2 semanales` es UNA SOLA FILA (D11).
 *
 * Se renderiza "2 visitas semanales" para clinico y "2 sesiones semanales"
 * para kinesiologia, segun el `serviceUnit` de la especialidad.
 *
 * Seed en la instalacion, nunca reaplicado en updates: si se reaplica,
 * resucita frecuencias que la coordinacion borro. Baja logica, nunca DELETE.
 */
export interface Frequency {
  id: string
  amount: number
  unit: FrequencyUnit
  active: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * ES el filtro del selector, no una feature de UI que haya que acordarse de
 * programar: asignar Medico Clinico no ofrece 100 frecuencias, ofrece las que
 * estan relacionadas con clinico (D11).
 */
export interface SpecialtyFrequency {
  id: string
  specialtyId: string
  frequencyId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
