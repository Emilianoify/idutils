import type { ServiceUnit } from '../../generated/prisma/enums.js'

/**
 * No lleva `auditedByAmanda`: eso es del modulo Amanda (D4).
 */
export interface Specialty {
  id: string
  name: string
  /**
   * El sustantivo con el que se renderiza la frecuencia. "Visitas" y "sesiones"
   * no son dos tipos de frecuencia: es la misma matematica con otro sustantivo,
   * y el sustantivo lo define la especialidad, no la frecuencia (D11).
   */
  serviceUnit: ServiceUnit
  active: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
