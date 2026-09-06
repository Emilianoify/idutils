import type { CloseReason, ServiceUnit } from '../../generated/prisma/enums.js'
import type { Authorization } from '../entities/authorizationEntity.js'

/**
 * Puerto de LECTURA del dashboard. Separado de los repositorios de escritura a
 * proposito.
 *
 * Trae las filas ya cruzadas con los nombres porque eso es lo que SQL hace
 * bien, y el caso de uso no tiene por que resolver un join a mano paciente por
 * paciente.
 *
 * Lo que NO trae es el veredicto: ninguna de estas filas dice "por vencer". Eso
 * lo decide `coverageAt` sobre las autorizaciones que vienen aca adentro. Si la
 * query decidiera, habria dos implementaciones de la regla mas importante del
 * sistema y el dia que se mueva el umbral van a decir cosas distintas.
 */

export interface ActiveCareServiceRow {
  careServiceId: string
  episodeId: string
  patientId: string
  patientLastName: string
  patientFirstName: string
  specialtyId: string
  specialtyName: string
  /** Para renderizar la frecuencia con el sustantivo correcto (D11). */
  serviceUnit: ServiceUnit
  contractingCompanyId: string
  contractingCompanyName: string
  professionalId: string | null
  professionalLastName: string | null
  professionalFirstName: string | null
  /** Todas las de la prestacion. `coverageAt` decide sobre esto. */
  authorizations: Authorization[]
}

/** Un episodio cerrado que dejo al paciente en una bandeja pendiente. */
export interface PendingEpisodeRow {
  episodeId: string
  patientId: string
  patientLastName: string
  patientFirstName: string
  endsOn: Date
  closeReason: CloseReason
  closeNote: string | null
}

export interface IDashboardQuery {
  /**
   * Prestaciones de episodios abiertos y ya comenzados a esa fecha, sin
   * `endedOn` ni baja logica.
   */
  listActiveCareServices(asOf: Date): Promise<ActiveCareServiceRow[]>

  /**
   * Pacientes con episodio abierto y ya comenzado.
   *
   * Se cuenta aparte y no sobre las filas de arriba porque un paciente puede
   * estar activo con CERO prestaciones cargadas: es un alta a medio hacer, y
   * esconderla del contador es justamente perderla de vista.
   */
  countActivePatients(asOf: Date): Promise<number>

  /**
   * Los ultimos episodios cerrados que siguen sin episodio posterior. Es la
   * materia prima de las bandejas: esperando alta y reautorizar.
   */
  listPendingEpisodes(asOf: Date): Promise<PendingEpisodeRow[]>
}
