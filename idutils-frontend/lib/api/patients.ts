import { z } from 'zod'
import { CloseReason, PatientStatus, WorkQueue } from '@/lib/domain/patient'
import { apiFetch } from './client'

/**
 * Pacientes: búsqueda, alta, ficha y el lookup previo de D8.
 *
 * Los tipos salen del DTO del backend (`application/dto/patientDto.ts`), no de
 * la entidad de dominio. La entidad tiene campos que el mapper no serializa
 * nunca; copiarla produce un tipo que miente y que TypeScript no puede
 * desmentir, porque el JSON entra sin validar. Por eso cada respuesta se parsea
 * con Zod en el borde en vez de castearse.
 *
 * Las fechas llegan como ISO —el DTO declara `Date` y Express lo serializa— y
 * se conservan como string. Convertirlas a `Date` acá volvería a abrir el
 * problema de huso que `lib/format/dateOnly.ts` evita.
 */

const patientSummarySchema = z.object({
  id: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  documentNumber: z.string().nullable(),
  status: z.enum(PatientStatus),
  /** Obra social vigente, o null si el paciente está sin cobertura. */
  insuranceProviderName: z.string().nullable(),
  memberNumber: z.string().nullable(),
})

const affiliationSchema = z.object({
  id: z.string(),
  insuranceProviderId: z.string(),
  insuranceProviderName: z.string(),
  memberNumber: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  isCurrent: z.boolean(),
})

const episodeSchema = z.object({
  id: z.string(),
  affiliationId: z.string(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  closeReason: z.enum(CloseReason).nullable(),
  closeNote: z.string().nullable(),
})

const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
  isPrimary: z.boolean(),
})

const patientDetailSchema = z.object({
  id: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  documentNumber: z.string().nullable(),
  birthDate: z.string().nullable(),
  addressStreet: z.string(),
  addressDetail: z.string().nullable(),
  localityId: z.string(),
  notes: z.string(),
  status: z.enum(PatientStatus),
  /** null cuando no hay nada pendiente que hacer con este paciente. */
  workQueue: z.enum(WorkQueue).nullable(),
  affiliations: z.array(affiliationSchema),
  episodes: z.array(episodeSchema),
  contacts: z.array(contactSchema),
})

const affiliationLookupSchema = z.object({
  found: z.boolean(),
  /** El paciente al que ya pertenece esa afiliación vigente. */
  patient: patientSummarySchema.nullable(),
})

export type PatientSummary = z.infer<typeof patientSummarySchema>
export type PatientDetail = z.infer<typeof patientDetailSchema>
export type Affiliation = z.infer<typeof affiliationSchema>
export type Episode = z.infer<typeof episodeSchema>
export type AffiliationLookup = z.infer<typeof affiliationLookupSchema>

const patientListEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(patientSummarySchema),
  /**
   * El total va acá y no adentro de `data` porque no es un paciente: es
   * información sobre la ventana. Y la ventana es `limit`/`offset`, no número
   * de página — es lo que la base ejecuta.
   */
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
})

const patientDetailEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: patientDetailSchema,
})

/**
 * El alta contesta el RESUMEN, no la ficha.
 *
 * El caso de uso devuelve `PatientSummary`, y tiparlo como la ficha sería un
 * tipo que miente: `affiliations`, `episodes` y `contacts` llegarían siempre
 * `undefined`, y el error explotaría recién en la pantalla siguiente. Por eso
 * el alta navega a la ficha por id en vez de pintar lo que le contestaron.
 */
const patientCreatedEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: patientSummarySchema,
})

const affiliationLookupEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: affiliationLookupSchema,
})

export interface PatientSearchParams {
  text?: string | undefined
  localityId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PatientPage {
  items: PatientSummary[]
  total: number
  limit: number
  offset: number
}

export async function searchPatients(
  params: PatientSearchParams = {},
): Promise<PatientPage> {
  const query = new URLSearchParams()

  // Los filtros se OMITEN cuando no vienen, en vez de mandarse vacíos: para el
  // backend "sin filtro de texto" y "filtro de texto vacío" no son lo mismo, y
  // un `text=` pelado rebota contra su `min(1)`.
  if (params.text !== undefined && params.text.length > 0) query.set('text', params.text)
  if (params.localityId !== undefined) query.set('localityId', params.localityId)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))

  const suffix = query.size === 0 ? '' : `?${query.toString()}`
  const response = await apiFetch(
    `/api/patients${suffix}`,
    {},
    patientListEnvelope.parse,
  )

  return {
    items: response.data,
    total: response.meta.total,
    limit: response.meta.limit,
    offset: response.meta.offset,
  }
}

export async function getPatient(id: string): Promise<PatientDetail> {
  const response = await apiFetch(
    `/api/patients/${id}`,
    {},
    patientDetailEnvelope.parse,
  )
  return response.data
}

/**
 * El paso OBLIGATORIO de D8, antes de crear.
 *
 * `found: true` no vincula nada: devuelve a quién pertenece esa afiliación para
 * que el operador decida a mano si es la misma persona o si se equivocó de
 * número. Adivinar por nombre es exactamente como el Excel termina con tres
 * Juan Pérez.
 */
export async function lookupAffiliation(
  insuranceProviderId: string,
  memberNumber: string,
): Promise<AffiliationLookup> {
  const query = new URLSearchParams({ insuranceProviderId, memberNumber })
  const response = await apiFetch(
    `/api/affiliations/lookup?${query.toString()}`,
    {},
    affiliationLookupEnvelope.parse,
  )
  return response.data
}

export interface CreatePatientContact {
  name: string
  relationship: string
  phone: string
  isPrimary: boolean
}

/**
 * El alta lleva la afiliación adentro, no aparte.
 *
 * Es la forma del comando del backend y es deliberada: un paciente sin
 * cobertura es un alta a medias. Si fueran dos llamadas, la segunda podría no
 * llegar nunca y quedaría un paciente que después nadie sabe de dónde salió.
 */
export interface CreatePatientBody {
  lastName: string
  firstName: string
  documentNumber: string | null
  birthDate: string | null
  addressStreet: string
  addressDetail: string | null
  localityId: string
  notes: string
  affiliation: {
    insuranceProviderId: string
    memberNumber: string
    from: string
  }
  contacts: CreatePatientContact[]
}

export async function createPatient(body: CreatePatientBody): Promise<PatientSummary> {
  const response = await apiFetch(
    '/api/patients',
    { method: 'POST', body: JSON.stringify(body) },
    patientCreatedEnvelope.parse,
  )
  return response.data
}

/**
 * Cambio de obra social: tres escrituras y UN solo hecho (D8 + D9).
 *
 * Con una sola fecha, `changedOn`: ese día cierra la afiliación anterior,
 * cierra el episodio abierto y arranca la nueva. Pedir tres fechas invitaría a
 * que no coincidan, y un episodio que cierra un día distinto del que arranca la
 * cobertura nueva es un agujero en la historia del paciente.
 *
 * NO abre un episodio nuevo, y es a propósito: la obra social nueva puede
 * autorizar otras especialidades y otras frecuencias, así que nada de lo
 * anterior sobrevive. El paciente queda en la bandeja "reautorizar" y el
 * operador abre el episodio cuando tenga los papeles.
 */
const insuranceProviderChangeSchema = z.object({
  affiliationId: z.string(),
  /** Derivado: sin episodio abierto y con el último cerrado por cambio. */
  status: z.enum(PatientStatus),
})

export type InsuranceProviderChange = z.infer<typeof insuranceProviderChangeSchema>

const insuranceProviderChangeEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: insuranceProviderChangeSchema,
})

export interface ChangeInsuranceProviderBody {
  insuranceProviderId: string
  memberNumber: string
  changedOn: string
}

export async function changeInsuranceProvider(
  patientId: string,
  body: ChangeInsuranceProviderBody,
): Promise<InsuranceProviderChange> {
  const response = await apiFetch(
    `/api/patients/${patientId}/insurance-provider-change`,
    { method: 'POST', body: JSON.stringify(body) },
    insuranceProviderChangeEnvelope.parse,
  )
  return response.data
}

/**
 * Baja de un paciente CARGADO POR ERROR.
 *
 * No es darle el alta, y no borra nada. Es para un duplicado o una persona
 * equivocada. Si el paciente tiene episodios, el backend contesta 409 con el
 * mensaje que dice qué corresponde: cerrar el episodio con su motivo. Esa
 * historia es con la que se defiende una auditoría.
 *
 * Da de baja también la afiliación, y no es prolijidad: el índice único parcial
 * filtra por `to IS NULL AND deletedAt IS NULL`, así que una afiliación viva
 * ocuparía el par (obra social, N.º de afiliado) para siempre y el paciente de
 * verdad no se podría cargar nunca.
 */
export async function deactivatePatient(id: string): Promise<void> {
  await apiFetch(`/api/patients/${id}/deactivate`, { method: 'POST' })
}

/**
 * Corrige datos mal cargados. Se manda SOLO lo que cambió.
 *
 * Es PATCH y no PUT porque un PUT obligaría a reenviar la ficha entera, y el
 * campo que se olvide de mandar se borraría sin que nadie lo haya pedido.
 *
 * Fijate lo que NO se puede tocar acá: la cobertura y el estado. La obra social
 * tiene su propio endpoint porque cierra el episodio abierto, y el estado no es
 * una columna: se deriva de los episodios. Dejarlos entrar en un PATCH genérico
 * sería una puerta de atrás a las dos reglas más importantes del modelo.
 */
export interface UpdatePatientBody {
  lastName?: string
  firstName?: string
  documentNumber?: string | null
  birthDate?: string | null
  addressStreet?: string
  addressDetail?: string | null
  localityId?: string
  notes?: string
}

export async function updatePatient(
  id: string,
  changes: UpdatePatientBody,
): Promise<PatientDetail> {
  const response = await apiFetch(
    `/api/patients/${id}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
    patientDetailEnvelope.parse,
  )
  return response.data
}
