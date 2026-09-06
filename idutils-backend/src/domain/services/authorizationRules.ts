import type { FrozenFrequency } from '../entities/authorizationEntity.js'
import type { Frequency } from '../entities/frequencyEntity.js'

/**
 * Las reglas de creacion de una autorizacion (D10, D11).
 *
 * Dos cosas que parecen chicas y no lo son: la frecuencia elegible sale del
 * join especialidad-frecuencia y no del catalogo entero, y el valor de la
 * frecuencia se CONGELA al autorizar.
 */

export const AuthorizationViolation = {
  /** La prestacion esta dada de baja: no se autoriza lo que ya no se presta. */
  PRESTACION_DADA_DE_BAJA: 'PRESTACION_DADA_DE_BAJA',
  /** La frecuencia no esta relacionada con la especialidad de la prestacion (D11). */
  FRECUENCIA_NO_ELEGIBLE: 'FRECUENCIA_NO_ELEGIBLE',
  /** La frecuencia esta dada de baja en el catalogo. */
  FRECUENCIA_INACTIVA: 'FRECUENCIA_INACTIVA',
  /** El periodo termina antes de empezar. */
  PERIODO_INVALIDO: 'PERIODO_INVALIDO',
} as const

export type AuthorizationViolation =
  (typeof AuthorizationViolation)[keyof typeof AuthorizationViolation]

export interface AuthorizationDraft {
  careServiceEndedOn: Date | null
  careServiceDeletedAt: Date | null
  /** La frecuencia elegida, tal como esta hoy en el catalogo. */
  frequency: Frequency
  /** Frecuencias relacionadas con la especialidad de la prestacion. */
  eligibleFrequencyIds: readonly string[]
  validFrom: Date
  /** Inclusive. */
  validUntil: Date
}

export function validateAuthorizationDraft(
  draft: AuthorizationDraft,
): AuthorizationViolation[] {
  const violations: AuthorizationViolation[] = []

  if (draft.careServiceEndedOn !== null || draft.careServiceDeletedAt !== null) {
    violations.push(AuthorizationViolation.PRESTACION_DADA_DE_BAJA)
  }

  if (!draft.eligibleFrequencyIds.includes(draft.frequency.id)) {
    violations.push(AuthorizationViolation.FRECUENCIA_NO_ELEGIBLE)
  }

  if (!draft.frequency.active || draft.frequency.deletedAt !== null) {
    violations.push(AuthorizationViolation.FRECUENCIA_INACTIVA)
  }

  if (draft.validUntil.getTime() < draft.validFrom.getTime()) {
    violations.push(AuthorizationViolation.PERIODO_INVALIDO)
  }

  return violations
}

/**
 * Congela el valor de la frecuencia al momento de autorizar (D10).
 *
 * Los tres campos se escriben juntos o no se escriben. Existe esta funcion para
 * que nadie arme el objeto a mano y se olvide del `amount`, que es el error que
 * despues aparece como una autorizacion de agosto mostrando la frecuencia que
 * el catalogo tiene hoy.
 *
 * Parece violar la regla de "confiar en la fuente, no en el valor". No la
 * viola: ahi la fuente seguia siendo actual. Aca la fuente de que se autorizo
 * en agosto ES la autorizacion; el catalogo es un ayudante de carga.
 */
export function freezeFrequency(frequency: Frequency): FrozenFrequency {
  return {
    frequencyId: frequency.id,
    frequencyAmount: frequency.amount,
    frequencyUnit: frequency.unit,
  }
}
