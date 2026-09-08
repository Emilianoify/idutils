import { z } from 'zod'
import { FrequencyUnit, Role, ServiceUnit } from '../../../generated/prisma/enums.js'
import { normalizeEmail } from '../../../shared/normalization/email.js'
import { idSchema } from './commonSchemas.js'

/**
 * Lo que puede hacer un ADMIN.
 *
 * Fijate lo que NO hay en todo este archivo: ni un solo esquema de borrado. En
 * IDUtils no se borra nada del catálogo, se desactiva (D11): hay
 * autorizaciones apuntando a una frecuencia y prestaciones apuntando a una
 * especialidad, y borrarlas sería borrar la historia con la que se defiende una
 * auditoría.
 *
 * Tampoco hay un `PUT` de frecuencia, y también es deliberado. Editar `2
 * semanales` para que diga `3 semanales` reescribiría lo que se autorizó el mes
 * pasado. Editar es CREAR la nueva, engancharla donde corresponda y desactivar
 * la vieja: tres operaciones explícitas, ninguna implícita.
 */

// --- Especialidades ---------------------------------------------------------

export const createSpecialtySchema = z.object({
  name: z.string().min(1, { error: 'La especialidad necesita un nombre' }),
  /** El sustantivo con el que se renderiza la frecuencia: visitas, sesiones, horas. */
  serviceUnit: z.enum(ServiceUnit, { error: 'Elegí una unidad de servicio válida' }),
})

export const updateSpecialtySchema = z
  .object({
    name: z.string().min(1).optional(),
    serviceUnit: z.enum(ServiceUnit).optional(),
  })
  .refine((value) => value.name !== undefined || value.serviceUnit !== undefined, {
    error: 'No hay nada que cambiar',
  })

export const setSpecialtyFrequenciesSchema = z.object({
  /** El conjunto COMPLETO, no un agregado. Vacío es válido: deja la especialidad sin frecuencias. */
  frequencyIds: z.array(idSchema),
})

// --- Frecuencias ------------------------------------------------------------

export const createFrequencySchema = z.object({
  amount: z.coerce.number().int().positive({ error: 'La cantidad tiene que ser mayor que cero' }),
  unit: z.enum(FrequencyUnit, { error: 'La unidad tiene que ser SEMANAL o MENSUAL' }),
})

// --- Profesionales ----------------------------------------------------------

/**
 * `taxId`, `bankAccount` y `bankAlias` son datos de contacto de pago, no un
 * módulo de liquidación: IDUtils no calcula honorarios ni lleva cuenta
 * corriente. Son datos financieros de terceros y no salen nunca en un log.
 */
const professionalFields = {
  lastName: z.string().min(1, { error: 'El apellido es obligatorio' }),
  firstName: z.string().default(''),
  documentNumber: z.string().min(1).nullable().default(null),
  licenseNumber: z.string().min(1).nullable().default(null),
  phone: z.string().min(1).nullable().default(null),
  email: z.email().nullable().default(null),
  taxId: z.string().min(1).nullable().default(null),
  bankAccount: z.string().min(1).nullable().default(null),
  bankAlias: z.string().min(1).nullable().default(null),
  active: z.boolean().default(true),
}

export const createProfessionalSchema = z.object(professionalFields)

export const updateProfessionalSchema = z
  .object({
    lastName: z.string().min(1).optional(),
    firstName: z.string().optional(),
    documentNumber: z.string().min(1).nullable().optional(),
    licenseNumber: z.string().min(1).nullable().optional(),
    phone: z.string().min(1).nullable().optional(),
    email: z.email().nullable().optional(),
    taxId: z.string().min(1).nullable().optional(),
    bankAccount: z.string().min(1).nullable().optional(),
    bankAlias: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay nada que cambiar',
  })

export const setProfessionalSpecialtiesSchema = z.object({
  specialtyIds: z.array(idSchema),
})

// --- Empresas y obras sociales ----------------------------------------------

export const createContractingCompanySchema = z.object({
  name: z.string().min(1, { error: 'La empresa necesita un nombre' }),
  contactName: z.string().min(1).nullable().default(null),
  contactPhone: z.string().min(1).nullable().default(null),
  contactEmail: z.email().nullable().default(null),
  active: z.boolean().default(true),
})

export const setCompanyInsuranceProvidersSchema = z.object({
  insuranceProviderIds: z.array(idSchema),
})

/** Razón social literal, 1:1 con la fuente. Nada de siglas inventadas. */
export const createInsuranceProviderSchema = z.object({
  name: z.string().min(1, { error: 'La obra social necesita un nombre' }),
})

// --- Localidades ------------------------------------------------------------

/**
 * El alta de localidad, que es lo que hace instalable el catálogo de domicilio.
 *
 * El seed carga las 24 provincias y ninguna localidad: cada coordinación
 * atiende su zona (D12), y una lista inventada de miles de nombres es peor que
 * ninguna. La provincia es siempre una FK — el par (provincia, nombre) es único
 * en la base, así que la misma localidad no entra dos veces.
 *
 * No hay `PUT` ni desactivación: hay pacientes apuntando a la localidad, y su
 * domicilio es parte de la historia. Corregir un nombre mal escrito es tema
 * aparte y todavía no tiene regla decidida.
 */
export const createLocalitySchema = z.object({
  provinceId: idSchema,
  name: z.string().min(1, { error: 'La localidad necesita un nombre' }),
  postalCode: z.string().min(1).nullable().default(null),
})

// --- Usuarios ---------------------------------------------------------------

/**
 * Acá SÍ se exige largo mínimo, al revés que en el login.
 *
 * La diferencia es que acá se está CREANDO una credencial, no verificando una
 * que ya existe. Exigir doce caracteres para iniciar sesión sólo le contaría al
 * que prueba de a una que ese intento ni llegó a compararse.
 */
const passwordSchema = z
  .string()
  .min(12, { error: 'La contraseña necesita al menos 12 caracteres' })

export const createUserSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.email({ error: 'El correo no es válido' })),
  password: passwordSchema,
  name: z.string().min(1, { error: 'El usuario necesita un nombre' }),
  role: z.enum(Role, { error: 'El rol tiene que ser ADMIN, OPERADOR o LECTOR' }),
})

export const changeUserPasswordSchema = z.object({
  password: passwordSchema,
})
