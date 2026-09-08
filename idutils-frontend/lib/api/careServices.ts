import { z } from 'zod'
import { AuthorizationStatus } from '@/lib/domain/authorizationStatus'
import { apiFetch } from './client'

/**
 * Prestaciones y autorizaciones.
 *
 * El estado de cobertura llega DERIVADO: `status`, `daysUntilExpiry` y
 * `needsClaim` los calcula `coverageAt` del lado del servidor. Acá se muestran.
 * Volver a decidir cuál autorización está vigente sería un segundo motor de
 * vencimientos, y el día que cambie el umbral van a decir cosas distintas.
 */

const authorizationSchema = z.object({
  id: z.string(),
  frequencyId: z.string(),
  /** "2 sesiones semanales", con el sustantivo congelado de esa autorización. */
  frequencyLabel: z.string(),
  validFrom: z.string(),
  /** Inclusive: "hasta el 30/9" cubre el 30/9. */
  validUntil: z.string(),
  /** Cuándo se reclamó la renovación. null = todavía no se reclamó. */
  claimedAt: z.string().nullable(),
  notes: z.string(),
})

const careServiceTimelineSchema = z.object({
  careServiceId: z.string(),
  /** Lo pide el selector de frecuencias al renovar: el filtro es por especialidad (D11). */
  specialtyId: z.string(),
  specialtyName: z.string(),
  professionalName: z.string().nullable(),
  contractingCompanyName: z.string(),
  endedOn: z.string().nullable(),
  /**
   * Cierre del episodio. null = sigue abierto.
   *
   * Cambia cómo se LEE el estado: con el episodio cerrado, la cobertura que
   * llega es la que había AL CIERRE, no la de hoy.
   */
  episodeEndsOn: z.string().nullable(),
  /**
   * Si el episodio YA terminó a hoy. Lo decide el backend, no esta pantalla.
   *
   * No es `episodeEndsOn !== null`: un cierre con fecha futura —"el paciente se
   * va el jueves"— deja el episodio corriendo hasta ese día.
   */
  episodeFinished: z.boolean(),

  status: z.enum(AuthorizationStatus),
  daysUntilExpiry: z.number().nullable(),
  uncoveredSince: z.string().nullable(),
  /** La autorización que se reclama. null = no hay ninguna todavía. */
  claimableAuthorizationId: z.string().nullable(),
  needsClaim: z.boolean(),

  /** Más nueva primero. Esta lista ES la línea de tiempo de una auditoría. */
  authorizations: z.array(authorizationSchema),
})

export type Authorization = z.infer<typeof authorizationSchema>
export type CareServiceTimeline = z.infer<typeof careServiceTimelineSchema>

const timelineEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: careServiceTimelineSchema,
})

const timelineListEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.array(careServiceTimelineSchema),
})

/** Las prestaciones del episodio, cada una con su cobertura resuelta. */
export async function listEpisodeCareServices(
  episodeId: string,
): Promise<CareServiceTimeline[]> {
  const response = await apiFetch(
    `/api/episodes/${episodeId}/care-services`,
    {},
    timelineListEnvelope.parse,
  )
  return response.data
}

export async function getCareServiceTimeline(
  careServiceId: string,
): Promise<CareServiceTimeline> {
  const response = await apiFetch(
    `/api/care-services/${careServiceId}/authorizations`,
    {},
    timelineEnvelope.parse,
  )
  return response.data
}

export interface CreateCareServiceBody {
  episodeId: string
  specialtyId: string
  contractingCompanyId: string
  professionalId: string | null
}

/**
 * Agrega una prestación a un episodio ABIERTO.
 *
 * Fijate lo que no viaja: la obra social. Sale de la afiliación del episodio,
 * del lado del servidor. Si viniera de acá, un cliente podría mandar la que le
 * convenga y la validación de convenio de D2 se evapora.
 */
export async function createCareService(body: CreateCareServiceBody): Promise<void> {
  await apiFetch('/api/care-services', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** `null` la deja sin asignar. La prestación existe igual. */
export async function assignProfessional(
  careServiceId: string,
  professionalId: string | null,
): Promise<void> {
  await apiFetch(`/api/care-services/${careServiceId}/professional`, {
    method: 'PATCH',
    body: JSON.stringify({ professionalId }),
  })
}

/** Baja individual: el episodio sigue abierto y las demás prestaciones corren. */
export async function endCareService(
  careServiceId: string,
  endedOn: string,
): Promise<void> {
  await apiFetch(`/api/care-services/${careServiceId}/end`, {
    method: 'POST',
    body: JSON.stringify({ endedOn }),
  })
}

export interface CreateAuthorizationBody {
  frequencyId: string
  validFrom: string
  validUntil: string
  notes: string
}

/**
 * Renovar es AGREGAR una fila, nunca editar la anterior.
 *
 * Por eso no existe ningún `PUT` de autorización en toda la API: la prestación
 * vive y las autorizaciones se suceden abajo. Pisar un `validUntil` borraría la
 * línea de tiempo con la que se defiende una auditoría.
 */
export async function createAuthorization(
  careServiceId: string,
  body: CreateAuthorizationBody,
): Promise<void> {
  await apiFetch(`/api/care-services/${careServiceId}/authorizations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Reclamar NO es autorizar.
 *
 * Deja constancia de que se pidió la renovación. La prestación sale de la lista
 * de reclamos pendientes pero sigue venciendo, porque nadie autorizó nada
 * todavía. Confundir las dos cosas es como el sistema termina diciendo que algo
 * está autorizado porque alguien mandó un WhatsApp.
 */
export async function claimAuthorization(authorizationId: string): Promise<void> {
  await apiFetch(`/api/authorizations/${authorizationId}/claim`, { method: 'POST' })
}
