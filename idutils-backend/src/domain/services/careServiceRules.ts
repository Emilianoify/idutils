/**
 * Las reglas de creacion de una prestacion (modelo-core, "Validaciones al crear").
 *
 * Son funciones puras que devuelven violaciones, no que tiran excepciones ni
 * tocan la base. La capa de aplicacion decide que hacer con ellas; el dominio
 * solo sabe que esta bien y que esta mal.
 *
 * La primera regla es la que sostiene D2: no se puede cargar un paciente de una
 * obra social bajo una empresa que no tiene ese convenio. El sistema lo impide
 * en vez de confiar en el criterio del operador.
 */

import { episodeIsClosedAt } from './episodeTimeline.js'

export const CareServiceViolation = {
  /** El episodio esta cerrado o dado de baja: no se le cuelgan prestaciones nuevas. */
  EPISODIO_CERRADO: 'EPISODIO_CERRADO',
  /** La empresa no tiene convenio con la obra social de la afiliacion del episodio (D2). */
  EMPRESA_SIN_CONVENIO: 'EMPRESA_SIN_CONVENIO',
  /** El profesional asignado no tiene habilitada esa especialidad (D13). */
  PROFESIONAL_SIN_ESPECIALIDAD: 'PROFESIONAL_SIN_ESPECIALIDAD',
} as const

export type CareServiceViolation =
  (typeof CareServiceViolation)[keyof typeof CareServiceViolation]

/**
 * Todo lo que hace falta para decidir, ya resuelto por la capa de aplicacion.
 *
 * El dominio no sale a buscar nada: recibe los ids y contesta. Asi se testea
 * sin base, y asi la regla no depende de como esten armadas las queries.
 */
export interface CareServiceDraft {
  /** `endsOn` del episodio al que se quiere colgar. null = abierto. */
  episodeEndsOn: Date | null
  episodeDeletedAt: Date | null
  /** Obra social de la afiliacion del episodio. */
  insuranceProviderId: string
  contractingCompanyId: string
  specialtyId: string
  professionalId: string | null
  /** Obras sociales con las que la empresa contratante tiene convenio. */
  companyInsuranceProviderIds: readonly string[]
  /** Especialidades habilitadas del profesional. Vacio si no hay profesional. */
  professionalSpecialtyIds: readonly string[]
}

/**
 * Devuelve las violaciones encontradas. Array vacio = se puede crear.
 *
 * Devuelve TODAS y no la primera a proposito: un formulario que corrige un
 * error por vez y vuelve a fallar es como se pierde la paciencia del operador.
 */
export function validateCareServiceDraft(draft: CareServiceDraft): CareServiceViolation[] {
  const violations: CareServiceViolation[] = []

  if (draft.episodeEndsOn !== null || draft.episodeDeletedAt !== null) {
    violations.push(CareServiceViolation.EPISODIO_CERRADO)
  }

  if (!draft.companyInsuranceProviderIds.includes(draft.insuranceProviderId)) {
    violations.push(CareServiceViolation.EMPRESA_SIN_CONVENIO)
  }

  if (
    draft.professionalId !== null &&
    !draft.professionalSpecialtyIds.includes(draft.specialtyId)
  ) {
    violations.push(CareServiceViolation.PROFESIONAL_SIN_ESPECIALIDAD)
  }

  return violations
}

export const CareServiceMutationViolation = {
  ALREADY_ENDED: 'ALREADY_ENDED',
  NOT_MUTABLE: 'NOT_MUTABLE',
  EPISODIO_CERRADO: 'EPISODIO_CERRADO',
  ENDS_BEFORE_EPISODE_START: 'ENDS_BEFORE_EPISODE_START',
  ENDS_AFTER_EPISODE_END: 'ENDS_AFTER_EPISODE_END',
} as const

export type CareServiceMutationViolation =
  (typeof CareServiceMutationViolation)[keyof typeof CareServiceMutationViolation]

export interface CareServiceMutationState {
  serviceEndedOn: Date | null
  serviceDeletedAt: Date | null
  episodeEndsOn: Date | null
  episodeDeletedAt: Date | null
  /** La fecha contra la que se decide si el episodio sigue corriendo. */
  asOf: Date
}

/** Las mutaciones solo existen mientras prestación y episodio siguen abiertos. */
export function validateCareServiceMutation(
  state: CareServiceMutationState,
): CareServiceMutationViolation[] {
  const violations: CareServiceMutationViolation[] = []

  if (state.serviceEndedOn !== null) {
    violations.push(CareServiceMutationViolation.ALREADY_ENDED)
  }
  if (state.serviceDeletedAt !== null) {
    violations.push(CareServiceMutationViolation.NOT_MUTABLE)
  }
  if (episodeIsClosedAt(state.episodeEndsOn, state.asOf) || state.episodeDeletedAt !== null) {
    violations.push(CareServiceMutationViolation.EPISODIO_CERRADO)
  }

  return violations
}

export interface CareServiceEndDraft extends CareServiceMutationState {
  episodeStartsOn: Date
  endedOn: Date
}

/** Valida la baja como fecha civil dentro de la línea temporal del episodio. */
export function validateCareServiceEnd(
  draft: CareServiceEndDraft,
): CareServiceMutationViolation[] {
  const violations = validateCareServiceMutation(draft)

  if (draft.endedOn.getTime() < draft.episodeStartsOn.getTime()) {
    violations.push(CareServiceMutationViolation.ENDS_BEFORE_EPISODE_START)
  }
  if (draft.episodeEndsOn !== null && draft.endedOn.getTime() > draft.episodeEndsOn.getTime()) {
    violations.push(CareServiceMutationViolation.ENDS_AFTER_EPISODE_END)
  }

  return violations
}

/**
 * Lo que se copia al reingresar (D9, consecuencia 5).
 *
 * COPIA especialidad, profesional y empresa. NO COPIA autorizaciones,
 * frecuencias ni fechas: nada de eso sobrevive al cierre, y es justamente la
 * razon por la que el episodio se cerro.
 *
 * Lo que devuelve es un BORRADOR, no un hecho. El sistema propone; el operador
 * saca, agrega o cambia; recien al confirmar se crean las prestaciones. Si
 * copiara solo, algun dia habria prestaciones que nadie miro.
 */
export interface CareServiceCarryOver {
  specialtyId: string
  contractingCompanyId: string
  professionalId: string | null
}

export function carryOverForReadmission(
  previousServices: readonly {
    specialtyId: string
    contractingCompanyId: string
    professionalId: string | null
    endedOn: Date | null
    deletedAt: Date | null
  }[],
): CareServiceCarryOver[] {
  return previousServices
    .filter((service) => service.deletedAt === null && service.endedOn === null)
    .map((service) => ({
      specialtyId: service.specialtyId,
      contractingCompanyId: service.contractingCompanyId,
      professionalId: service.professionalId,
    }))
}
