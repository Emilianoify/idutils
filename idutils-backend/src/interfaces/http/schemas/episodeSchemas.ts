import { z } from 'zod'
import { CloseReason } from '../../../generated/prisma/enums.js'
import { dateOnlySchema, idSchema } from './commonSchemas.js'

const authorizationDraftSchema = z.object({
  frequencyId: idSchema,
  validFrom: dateOnlySchema,
  validUntil: dateOnlySchema,
  notes: z.string().default(''),
})

const episodeCareServiceSchema = z.object({
  specialtyId: idSchema,
  contractingCompanyId: idSchema,
  professionalId: idSchema.nullable().default(null),
  /**
   * Opcional de verdad. La prestacion puede existir mientras se espera el
   * papel, y el dashboard la va a mostrar como SIN_AUTORIZACION, que es
   * exactamente lo que es.
   */
  authorization: authorizationDraftSchema.nullable().default(null),
})

/**
 * Apertura de episodio con sus prestaciones, en un solo pedido.
 *
 * `startsOn` viene del operador y PUEDE SER FUTURO: cuando avisan que el
 * paciente vuelve el jueves, el episodio arranca el jueves. Por eso no hay
 * ninguna validacion de "no puede ser mayor que hoy": seria prohibir el caso
 * real mas comun.
 */
export const openEpisodeSchema = z.object({
  patientId: idSchema,
  affiliationId: idSchema,
  startsOn: dateOnlySchema,
  careServices: z.array(episodeCareServiceSchema).default([]),
})

/**
 * Cierre de episodio. `closeReason` es OBLIGATORIO.
 *
 * No es un dato de archivo: es lo que decide en que bandeja de trabajo cae el
 * paciente. Sin motivo, un hueco podria ser una internacion, una baja o un
 * cambio de obra social, y la bandeja directamente no existe.
 */
export const closeEpisodeSchema = z.object({
  endsOn: dateOnlySchema,
  closeReason: z.enum(CloseReason, { error: 'Elegí un motivo de cierre válido' }),
  /** Ej.: en que sanatorio quedo internado. */
  closeNote: z.string().min(1).nullable().default(null),
})
