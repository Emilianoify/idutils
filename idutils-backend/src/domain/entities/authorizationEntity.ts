import type { FrequencyUnit } from '../../generated/prisma/enums.js'

/**
 * Una fila por periodo autorizado (D10). La prestacion vive; las
 * autorizaciones se suceden abajo.
 *
 * La linea de tiempo para una auditoria no hay que construirla: es esta lista
 * ordenada por fecha. Y permite responder "cuantas veces tuve que reclamar
 * esta prestacion", que es el dato con el que se pelea un contrato.
 */
export interface Authorization {
  id: string
  careServiceId: string
  /** Referencia al catalogo: que frecuencia se eligio. */
  frequencyId: string
  /**
   * CONGELADOS al autorizar, y no es una violacion de "confiar en la fuente".
   * La fuente de que se autorizo en agosto ES esta autorizacion; el catalogo
   * es un ayudante de carga, no la verdad. Si el catalogo cambia despues, las
   * autorizaciones pasadas no se reescriben.
   */
  frequencyAmount: number
  frequencyUnit: FrequencyUnit
  validFrom: Date
  /** Inclusive: "hasta el 30/9" cubre el 30/9. */
  validUntil: Date
  /** Cuando se reclamo la renovacion. null = todavia no se reclamo. */
  claimedAt: Date | null
  /** N de autorizacion de la empresa, observaciones. */
  notes: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Los tres campos de frecuencia que se escriben juntos o no se escriben.
 * Los produce `freezeFrequency`; no se arman a mano en la capa de aplicacion.
 */
export interface FrozenFrequency {
  frequencyId: string
  frequencyAmount: number
  frequencyUnit: FrequencyUnit
}
