import type { CloseReason } from '../../generated/prisma/enums.js'
import type { PatientStatus } from '../../domain/enums/patientStatus.js'
import type { WorkQueue } from '../../domain/enums/workQueue.js'

/**
 * Comandos y vistas de la capa de aplicacion.
 *
 * Viven ACA y no en `interfaces/http` a proposito. Si el caso de uso importara
 * el DTO del controller, la flecha de dependencia se invertiria y el dia que lo
 * llame un cron o un comando de CLI se arrastraria Express con el. HTTP mapea
 * hacia estos tipos, no al reves.
 *
 * Las fechas son `Date` de dominio, ya parseadas. El string `YYYY-MM-DD` es un
 * detalle del transporte y se convierte en el borde.
 */

export interface CreatePatientContactCommand {
  name: string
  relationship: string
  phone: string
  isPrimary: boolean
}

export interface CreatePatientCommand {
  lastName: string
  firstName: string
  documentNumber: string | null
  birthDate: Date | null
  addressStreet: string
  addressDetail: string | null
  localityId: string
  notes: string
  /**
   * El paciente nace con su afiliacion. Son un solo hecho: un paciente sin
   * cobertura es un alta a medias que despues nadie sabe de donde salio.
   */
  affiliation: {
    insuranceProviderId: string
    /** Crudo. El caso de uso lo normaliza; el operador escribe como le llega. */
    memberNumber: string
    from: Date
  }
  contacts: CreatePatientContactCommand[]
}

/** Lo que se muestra en un listado. */
export interface PatientSummary {
  id: string
  lastName: string
  firstName: string
  documentNumber: string | null
  status: PatientStatus
  /** Obra social vigente, o null si esta sin cobertura. */
  insuranceProviderName: string | null
  memberNumber: string | null
}

export interface PatientSearchResultDto {
  items: PatientSummary[]
  total: number
}

export interface AffiliationView {
  id: string
  insuranceProviderId: string
  insuranceProviderName: string
  memberNumber: string
  from: Date
  to: Date | null
  isCurrent: boolean
}

export interface EpisodeView {
  id: string
  affiliationId: string
  startsOn: Date
  endsOn: Date | null
  closeReason: CloseReason | null
  closeNote: string | null
}

/** La ficha del paciente. Todo lo derivado ya viene resuelto. */
export interface PatientDetail {
  id: string
  lastName: string
  firstName: string
  documentNumber: string | null
  birthDate: Date | null
  addressStreet: string
  addressDetail: string | null
  localityId: string
  notes: string

  /** Derivado de los episodios, nunca de una columna. */
  status: PatientStatus
  /** null cuando no hay nada pendiente que hacer con este paciente. */
  workQueue: WorkQueue | null

  affiliations: AffiliationView[]
  episodes: EpisodeView[]

  contacts: {
    id: string
    name: string
    relationship: string
    phone: string
    isPrimary: boolean
  }[]
}

/**
 * El resultado de buscar una afiliacion por (obra social, N de afiliado).
 *
 * Es el paso que D8 exige antes de crear: si ya existe, el operador tiene que
 * decidir a mano si vincula o si se equivoco de numero. El sistema no adivina.
 */
export interface AffiliationLookupResult {
  found: boolean
  /** El paciente al que ya pertenece esa afiliacion vigente. */
  patient: PatientSummary | null
}
