import { z } from 'zod'

/**
 * Las reglas del alta, escritas del lado del navegador.
 *
 * Son las MISMAS que `interfaces/http/schemas/patientSchemas.ts` del backend.
 * No las reemplazan: la validación que manda es la de la API, porque un cliente
 * se puede saltear. Están acá para no hacer un viaje al servidor por un
 * apellido vacío, y para poder marcar todos los campos juntos.
 *
 * Un campo de texto opcional se manda `null`, no `''`: el backend declara
 * `.min(1).nullable()`, así que la cadena vacía REBOTA. "No lo cargaron" y
 * "lo cargaron vacío" no son lo mismo, y el tipo del comando obliga a elegir.
 */

/** `YYYY-MM-DD`, lo que produce un `<input type="date">`. Igual que `dateOnlySchema`. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha tiene que tener el formato AAAA-MM-DD' })
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    // Compara contra lo que el calendario acepta de verdad: el 31/02 se
    // convierte solo en 03/03, y sin esta vuelta pasaría como válido.
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  }, { error: 'Esa fecha no existe en el calendario' })

/** Texto opcional: vacío significa ausente, y ausente viaja como `null`. */
const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length === 0 ? null : value))

/**
 * El lookup de D8: obra social + número de afiliado.
 *
 * Es lo único que se pide al principio, y es a propósito. El resto del
 * formulario no aparece hasta saber si esa afiliación ya es de alguien.
 */
export const affiliationLookupSchema = z.object({
  insuranceProviderId: z.uuid({ error: 'Elegí una obra social' }),
  memberNumber: z
    .string()
    .trim()
    .min(1, { error: 'El número de afiliado es obligatorio' }),
})

export type AffiliationLookupInput = z.infer<typeof affiliationLookupSchema>

export const patientContactSchema = z.object({
  name: z.string().trim().min(1, { error: 'El contacto necesita un nombre' }),
  relationship: z
    .string()
    .trim()
    .min(1, { error: 'Indicá el vínculo: hijo, esposa, cuidadora' }),
  phone: z.string().trim().min(1, { error: 'El contacto necesita un teléfono' }),
  isPrimary: z.boolean(),
})

export type PatientContactInput = z.infer<typeof patientContactSchema>

/**
 * El resto del alta, una vez que el lookup dio `found: false`.
 *
 * La afiliación no está acá: viene del paso anterior ya confirmado. Volver a
 * pedirla dejaría cambiarla después del lookup, y el lookup habría verificado
 * un número distinto del que se guarda.
 */
export const createPatientDetailsSchema = z.object({
  lastName: z.string().trim().min(1, { error: 'El apellido es obligatorio' }),
  firstName: z.string().trim(),
  documentNumber: optionalText,
  birthDate: dateOnly.nullable(),
  addressStreet: z.string().trim().min(1, { error: 'El domicilio es obligatorio' }),
  addressDetail: optionalText,
  // Siempre FK al catálogo, nunca texto libre (D12).
  localityId: z.uuid({ error: 'Elegí una localidad' }),
  notes: z.string(),
  from: dateOnly,
  contacts: z.array(patientContactSchema),
})

export type CreatePatientDetailsInput = z.infer<typeof createPatientDetailsSchema>

/**
 * El cambio de obra social. UNA sola fecha.
 *
 * Ese día cierra la afiliación anterior, cierra el episodio abierto y arranca
 * la nueva. Tres fechas distintas invitarían a que no coincidan, y un episodio
 * que cierra un día distinto del que empieza la cobertura nueva deja un hueco
 * en la historia del paciente.
 */
export const changeInsuranceProviderSchema = z.object({
  insuranceProviderId: z.uuid({ error: 'Elegí la obra social nueva' }),
  memberNumber: z
    .string()
    .trim()
    .min(1, { error: 'El número de afiliado es obligatorio' }),
  changedOn: dateOnly,
})

export type ChangeInsuranceProviderInput = z.infer<typeof changeInsuranceProviderSchema>

/**
 * La corrección de datos. Todos los campos opcionales, al menos uno.
 *
 * Espejo del `updatePatientSchema` del backend, incluido su `.refine()`: mandar
 * un PATCH sin nada adentro no es una corrección, es un pedido vacío.
 */
export const updatePatientSchema = z
  .object({
    lastName: z.string().trim().min(1, { error: 'El apellido es obligatorio' }),
    firstName: z.string().trim(),
    documentNumber: optionalText,
    birthDate: dateOnly.nullable(),
    addressStreet: z.string().trim().min(1, { error: 'El domicilio es obligatorio' }),
    addressDetail: optionalText,
    localityId: z.uuid({ error: 'Elegí una localidad' }),
    notes: z.string(),
  })

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>
