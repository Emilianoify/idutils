import type { IClock } from '../../../domain/repositories/IClock.js'
import type {
  ActiveCareServiceRow,
  IDashboardQuery,
  PendingEpisodeRow,
} from '../../../domain/repositories/IDashboardQuery.js'
import {
  AuthorizationStatus,
  DEFAULT_EXPIRY_WARNING_DAYS,
} from '../../../domain/enums/authorizationStatus.js'
import { WorkQueue, isPending } from '../../../domain/enums/workQueue.js'
import { coverageAt, needsClaim } from '../../../domain/services/authorizationCoverage.js'
import { formatFrequency } from '../../../domain/services/frequencyLabel.js'
import { workQueueForCloseReason } from '../../../domain/services/patientStatus.js'
import { daysBetweenDateOnly } from '../../../shared/helpers/dateOnly.js'
import type {
  CareServiceStatusRow,
  CompanyBreakdown,
  DashboardSummary,
  WorkQueueItem,
} from '../../dto/dashboardDto.js'

/**
 * El dashboard v1: "el operador entra... y ve 5 por vencer".
 *
 * Traer todas las prestaciones activas a memoria y decidir aca es deliberado.
 * La regla de vencimiento vive en `coverageAt` y se aplica UNA vez; si la query
 * decidiera, habria dos implementaciones de la regla mas importante del sistema
 * y el dia que se mueva el umbral van a decir cosas distintas.
 *
 * Se banca de sobra: una coordinacion de 10 pacientes no tiene un problema de
 * volumen, tiene un problema de memoria (D0). El dia que una instalacion tenga
 * miles de prestaciones activas, se pagina; no se duplica la regla.
 */
export class GetDashboardUseCase {
  constructor(
    private readonly dashboardQuery: IDashboardQuery,
    private readonly clock: IClock,
    /** Lo administra la coordinacion. El default es lo que tarda una empresa en renovar. */
    private readonly warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
  ) {}

  async execute(): Promise<DashboardSummary> {
    const asOf = this.clock.today()

    const [activeRows, activePatients, pendingEpisodes] = await Promise.all([
      this.dashboardQuery.listActiveCareServices(asOf),
      this.dashboardQuery.countActivePatients(asOf),
      this.dashboardQuery.listPendingEpisodes(asOf),
    ])

    const statuses = activeRows.map((row) => this.toStatusRow(row, asOf))

    return {
      asOf,
      warningDays: this.warningDays,
      counters: {
        activePatients,
        activeCareServices: statuses.length,
        expiringSoon: this.countBy(statuses, AuthorizationStatus.POR_VENCER),
        expired: this.countBy(statuses, AuthorizationStatus.VENCIDA),
        withoutAuthorization: this.countBy(statuses, AuthorizationStatus.SIN_AUTORIZACION),
        pendingClaims: statuses.filter((status) => status.needsClaim).length,
      },
      byCompany: this.groupByCompany(statuses),
      claims: statuses.filter((status) => status.needsClaim).sort(compareUrgency),
      workQueues: this.toWorkQueues(pendingEpisodes, asOf),
    }
  }

  private toStatusRow(row: ActiveCareServiceRow, asOf: Date): CareServiceStatusRow {
    const coverage = coverageAt(row.authorizations, asOf, this.warningDays)

    // Para una vencida se muestra la frecuencia de la ultima que hubo: decir
    // "sin frecuencia" cuando la prestacion viene de tener uno es esconder el
    // dato con el que el operador va a reclamar.
    const reference = coverage.current ?? coverage.previous

    return {
      careServiceId: row.careServiceId,
      patientId: row.patientId,
      patientName: fullName(row.patientLastName, row.patientFirstName),
      specialtyName: row.specialtyName,
      contractingCompanyId: row.contractingCompanyId,
      contractingCompanyName: row.contractingCompanyName,
      professionalName:
        row.professionalLastName === null
          ? null
          : fullName(row.professionalLastName, row.professionalFirstName ?? ''),
      frequencyLabel:
        reference === null
          ? null
          : formatFrequency(
              { amount: reference.frequencyAmount, unit: reference.frequencyUnit },
              row.serviceUnit,
            ),
      status: coverage.status,
      daysUntilExpiry: coverage.daysUntilExpiry,
      validUntil: coverage.current?.validUntil ?? null,
      uncoveredSince: coverage.previous?.validUntil ?? null,
      claimed: coverage.current?.claimedAt != null,
      hasUpcomingAuthorization: coverage.next !== null,
      needsClaim: needsClaim(coverage),
    }
  }

  private countBy(rows: readonly CareServiceStatusRow[], status: AuthorizationStatus): number {
    return rows.filter((row) => row.status === status).length
  }

  /** El mismo corte por empresa: es a quien hay que llamar (D10). */
  private groupByCompany(rows: readonly CareServiceStatusRow[]): CompanyBreakdown[] {
    const byCompany = new Map<string, CompanyBreakdown>()

    for (const row of rows) {
      const current = byCompany.get(row.contractingCompanyId) ?? {
        contractingCompanyId: row.contractingCompanyId,
        contractingCompanyName: row.contractingCompanyName,
        activeCareServices: 0,
        expiringSoon: 0,
        expired: 0,
        pendingClaims: 0,
      }

      current.activeCareServices += 1
      if (row.status === AuthorizationStatus.POR_VENCER) current.expiringSoon += 1
      if (row.status === AuthorizationStatus.VENCIDA) current.expired += 1
      if (row.needsClaim) current.pendingClaims += 1

      byCompany.set(row.contractingCompanyId, current)
    }

    return [...byCompany.values()].sort(
      (a, b) => b.pendingClaims - a.pendingClaims || a.contractingCompanyName.localeCompare(b.contractingCompanyName),
    )
  }

  /**
   * Las bandejas. Sin esto el paciente internado desaparece de la pantalla y
   * volvimos a que la coordinadora se acuerde de memoria.
   */
  private toWorkQueues(rows: readonly PendingEpisodeRow[], asOf: Date): WorkQueueItem[] {
    return rows
      .map((row) => ({
        queue: workQueueForCloseReason(row.closeReason),
        patientId: row.patientId,
        patientName: fullName(row.patientLastName, row.patientFirstName),
        episodeId: row.episodeId,
        closedOn: row.endsOn,
        closeReason: row.closeReason,
        closeNote: row.closeNote,
        daysWaiting: daysBetweenDateOnly(row.endsOn, asOf),
      }))
      .filter((item) => isPending(item.queue))
      .sort(
        (a, b) =>
          queueRank(a.queue) - queueRank(b.queue) || b.daysWaiting - a.daysWaiting,
      )
  }
}

function fullName(lastName: string, firstName: string): string {
  return firstName.length === 0 ? lastName : `${lastName}, ${firstName}`
}

/** Reautorizar primero: es lo unico de las dos bandejas que depende de nosotros. */
function queueRank(queue: WorkQueue): number {
  return queue === WorkQueue.REAUTORIZAR ? 0 : 1
}

/**
 * Lo mas urgente arriba: primero lo que ya esta descubierto, despues lo que
 * vence antes. Una lista ordenada por fecha de carga es una lista que nadie mira.
 */
function compareUrgency(a: CareServiceStatusRow, b: CareServiceStatusRow): number {
  const rank = statusRank(a.status) - statusRank(b.status)
  if (rank !== 0) return rank

  if (a.daysUntilExpiry !== null && b.daysUntilExpiry !== null) {
    return a.daysUntilExpiry - b.daysUntilExpiry
  }

  if (a.uncoveredSince !== null && b.uncoveredSince !== null) {
    return a.uncoveredSince.getTime() - b.uncoveredSince.getTime()
  }

  return a.patientName.localeCompare(b.patientName)
}

function statusRank(status: AuthorizationStatus): number {
  if (status === AuthorizationStatus.VENCIDA) return 0
  if (status === AuthorizationStatus.SIN_AUTORIZACION) return 1
  if (status === AuthorizationStatus.POR_VENCER) return 2
  return 3
}
