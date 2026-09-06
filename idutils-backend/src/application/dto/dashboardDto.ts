import type { CloseReason } from '../../generated/prisma/enums.js'
import type { AuthorizationStatus } from '../../domain/enums/authorizationStatus.js'
import type { WorkQueue } from '../../domain/enums/workQueue.js'

/**
 * El dashboard v1.
 *
 * "El operador entra... y ve el dashboard con 5 por vencer". Si eso anda,
 * IDUtils existe.
 */

/** Una prestacion tal como se lee en una lista de vencimientos. */
export interface CareServiceStatusRow {
  careServiceId: string
  patientId: string
  patientName: string
  specialtyName: string
  contractingCompanyId: string
  contractingCompanyName: string
  professionalName: string | null
  /** "2 sesiones semanales", ya con el sustantivo de la especialidad. */
  frequencyLabel: string | null

  status: AuthorizationStatus
  /** Negativo no existe aca: si vencio, mira `uncoveredSince`. */
  daysUntilExpiry: number | null
  validUntil: Date | null
  /** Desde cuando esta descubierta, cuando el estado es VENCIDA. */
  uncoveredSince: Date | null
  /** Ya se reclamo la renovacion de la autorizacion vigente. */
  claimed: boolean
  /** Hay una renovacion cargada para mas adelante: no hay que reclamar. */
  hasUpcomingAuthorization: boolean
  /** Lo que el operador tiene que hacer hoy. */
  needsClaim: boolean
}

/** Las tarjetas de arriba. */
export interface DashboardCounters {
  activePatients: number
  activeCareServices: number
  expiringSoon: number
  expired: number
  withoutAuthorization: number
  /** Las que efectivamente hay que reclamar hoy, sin contar las ya reclamadas. */
  pendingClaims: number
}

/** El mismo corte, agrupado por empresa: es a quien hay que llamar. */
export interface CompanyBreakdown {
  contractingCompanyId: string
  contractingCompanyName: string
  activeCareServices: number
  expiringSoon: number
  expired: number
  pendingClaims: number
}

export interface WorkQueueItem {
  queue: WorkQueue
  patientId: string
  patientName: string
  episodeId: string
  closedOn: Date
  closeReason: CloseReason
  closeNote: string | null
  /** Dias que lleva en la bandeja. La internacion no tiene fecha de vuelta, pero si antiguedad. */
  daysWaiting: number
}

export interface DashboardSummary {
  asOf: Date
  warningDays: number
  counters: DashboardCounters
  byCompany: CompanyBreakdown[]
  /** Lo que hay que reclamar, lo mas urgente primero. */
  claims: CareServiceStatusRow[]
  /** Esperando alta y reautorizar. Sin esto el paciente internado desaparece. */
  workQueues: WorkQueueItem[]
}
