import { z } from 'zod'
import { dateOnlySchema, idSchema } from './commonSchemas.js'

/**
 * Alta de prestacion sobre un episodio abierto.
 *
 * Fijate lo que NO viene: la obra social. Sale de la afiliacion del episodio,
 * del lado del servidor. Si viniera de afuera, un cliente podria mandar la que
 * le convenga y la validacion de convenio de D2 se evapora.
 */
export const createCareServiceSchema = z.object({
  episodeId: idSchema,
  specialtyId: idSchema,
  contractingCompanyId: idSchema,
  /** `null` = todavia sin asignar. La prestacion existe igual. */
  professionalId: idSchema.nullable().default(null),
})

export const assignProfessionalSchema = z.object({
  professionalId: idSchema.nullable(),
})

export const endCareServiceSchema = z.object({
  endedOn: dateOnlySchema,
})

/**
 * Renovacion: se AGREGA una autorizacion, nunca se edita la anterior.
 *
 * Por eso no existe un PUT de autorizacion en toda la API. La prestacion vive y
 * las autorizaciones se suceden abajo; pisar `validUntil` borraria la linea de
 * tiempo con la que se defiende una auditoria.
 */
export const createAuthorizationSchema = z.object({
  frequencyId: idSchema,
  validFrom: dateOnlySchema,
  validUntil: dateOnlySchema,
  /** N de autorizacion de la empresa, observaciones. */
  notes: z.string().default(''),
})
