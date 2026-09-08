import { z } from 'zod'
import { AuthorizationStatus } from '@/lib/domain/authorizationStatus'
import { CloseReason, WorkQueue } from '@/lib/domain/patient'
import { apiFetch } from './client'

/**
 * Una prestación tal como se lee en la lista de vencimientos.
 *
 * `status`, `daysUntilExpiry` y `needsClaim` los deriva el backend con
 * `coverageAt`. `frequencyLabel` ya viene con el sustantivo de la especialidad
 * (D11). Acá no se calcula nada: se muestra.
 */
const careServiceStatusRowSchema = z.object({
  careServiceId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  specialtyName: z.string(),
  contractingCompanyId: z.string(),
  contractingCompanyName: z.string(),
  professionalName: z.string().nullable(),
  frequencyLabel: z.string().nullable(),
  status: z.enum(AuthorizationStatus),
  daysUntilExpiry: z.number().nullable(),
  validUntil: z.string().nullable(),
  uncoveredSince: z.string().nullable(),
  /** Ya se reclamó la renovación de la autorización vigente. */
  claimed: z.boolean(),
  /** Hay una renovación cargada para más adelante: no hay que reclamar. */
  hasUpcomingAuthorization: z.boolean(),
  /** Lo que el operador tiene que hacer HOY. */
  needsClaim: z.boolean(),
})

/** El mismo corte agrupado por empresa: es a quién hay que llamar. */
const companyBreakdownSchema = z.object({
  contractingCompanyId: z.string(),
  contractingCompanyName: z.string(),
  activeCareServices: z.number(),
  expiringSoon: z.number(),
  expired: z.number(),
  pendingClaims: z.number(),
})

export type CareServiceStatusRow = z.infer<typeof careServiceStatusRowSchema>
export type CompanyBreakdown = z.infer<typeof companyBreakdownSchema>

/**
 * Una fila de bandeja de trabajo.
 *
 * El motivo de cierre no es un dato de archivo: es lo que decide qué aparece
 * como pendiente. Si el paciente internado desaparece de la pantalla, volvimos
 * a que la coordinadora se acuerde de memoria — que es el problema que IDUtils
 * vino a resolver.
 */
const workQueueItemSchema = z.object({
  queue: z.enum(WorkQueue),
  patientId: z.string(),
  patientName: z.string(),
  episodeId: z.string(),
  closedOn: z.string(),
  closeReason: z.enum(CloseReason),
  closeNote: z.string().nullable(),
  /** La internación no tiene fecha de vuelta, pero sí antigüedad. */
  daysWaiting: z.number(),
})

export type WorkQueueItem = z.infer<typeof workQueueItemSchema>

const dashboardSummarySchema = z.object({
  warningDays: z.number(),
  /** Lo que hay que reclamar, lo más urgente primero. */
  claims: z.array(careServiceStatusRowSchema),
  byCompany: z.array(companyBreakdownSchema),
  /** Esperando alta y reautorizar. Sin esto el paciente internado desaparece. */
  workQueues: z.array(workQueueItemSchema),
  counters: z.object({
    activePatients: z.number(),
    activeCareServices: z.number(),
    expiringSoon: z.number(),
    expired: z.number(),
    withoutAuthorization: z.number(),
    pendingClaims: z.number(),
  }),
})

const dashboardEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: dashboardSummarySchema,
})

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>

export async function getDashboard(): Promise<DashboardSummary> {
  const response = await apiFetch('/api/dashboard', {}, dashboardEnvelopeSchema.parse)
  return response.data
}
