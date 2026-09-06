import { z } from 'zod'
import { dateOnlySchema, idSchema } from './commonSchemas.js'

const contactSchema = z.object({
  name: z.string().min(1, { error: 'El contacto necesita un nombre' }),
  relationship: z.string().min(1, { error: 'Indicá el vínculo: hijo, esposa, cuidadora' }),
  phone: z.string().min(1, { error: 'El contacto necesita un teléfono' }),
  isPrimary: z.boolean().default(false),
})

/**
 * El alta de paciente lleva la afiliacion adentro, no aparte.
 *
 * Es la forma del comando y es deliberada: un paciente sin cobertura es un alta
 * a medias. Si fueran dos endpoints, el segundo podria no llegar nunca y
 * quedaria un paciente que despues nadie sabe de donde salio.
 */
export const createPatientSchema = z.object({
  lastName: z.string().min(1, { error: 'El apellido es obligatorio' }),
  firstName: z.string().default(''),
  documentNumber: z.string().min(1).nullable().default(null),
  birthDate: dateOnlySchema.nullable().default(null),
  addressStreet: z.string().min(1, { error: 'El domicilio es obligatorio' }),
  addressDetail: z.string().min(1).nullable().default(null),
  // Siempre FK al catalogo, nunca texto libre (D12).
  localityId: idSchema,
  notes: z.string().default(''),
  affiliation: z.object({
    insuranceProviderId: idSchema,
    // Crudo: el operador escribe como le llega y el caso de uso normaliza.
    memberNumber: z.string().min(1, { error: 'El número de afiliado es obligatorio' }),
    from: dateOnlySchema,
  }),
  contacts: z.array(contactSchema).default([]),
})

/**
 * La consulta que D8 exige ANTES de crear.
 *
 * Es un GET con query y no un POST porque no cambia nada: pregunta si esa
 * afiliacion ya existe. La decision de vincular o crear la toma el operador
 * despues, a mano.
 */
export const affiliationLookupSchema = z.object({
  insuranceProviderId: idSchema,
  memberNumber: z.string().min(1, { error: 'El número de afiliado es obligatorio' }),
})

export const patientSearchSchema = z.object({
  text: z.string().min(1).optional(),
  localityId: idSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Cambio de obra social. Una sola fecha: `changedOn`.
 *
 * Ese dia cierra la afiliacion anterior, cierra el episodio abierto y arranca
 * la nueva. Pedir tres fechas invitaria a que no coincidan, y un episodio que
 * cierra un dia distinto del que arranca la cobertura nueva es un agujero en la
 * historia del paciente.
 */
export const changeInsuranceProviderSchema = z.object({
  insuranceProviderId: idSchema,
  memberNumber: z.string().min(1, { error: 'El número de afiliado es obligatorio' }),
  changedOn: dateOnlySchema,
})

/**
 * Corrección de datos del paciente. Todos los campos opcionales, al menos uno.
 *
 * Fijate lo que NO se puede tocar acá: la afiliación y el estado. La cobertura
 * se cambia con su propio endpoint porque cierra el episodio abierto (D8 + D9),
 * y el estado no es una columna: se deriva de los episodios. Dejarlos entrar
 * en un PATCH genérico sería darle una puerta de atrás a las dos reglas más
 * importantes del modelo.
 */
export const updatePatientSchema = z
  .object({
    lastName: z.string().min(1).optional(),
    firstName: z.string().optional(),
    documentNumber: z.string().min(1).nullable().optional(),
    birthDate: dateOnlySchema.nullable().optional(),
    addressStreet: z.string().min(1).optional(),
    addressDetail: z.string().min(1).nullable().optional(),
    localityId: idSchema.optional(),
    notes: z.string().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay nada que cambiar',
  })
