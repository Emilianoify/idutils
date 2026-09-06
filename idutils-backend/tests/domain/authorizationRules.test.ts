import { describe, expect, it } from 'vitest'
import {
  AuthorizationViolation,
  freezeFrequency,
  validateAuthorizationDraft,
  type AuthorizationDraft,
} from '../../src/domain/services/authorizationRules.js'
import { d, frequency } from '../helpers/factories.js'

function draft(overrides: Partial<AuthorizationDraft> = {}): AuthorizationDraft {
  return {
    careServiceEndedOn: null,
    careServiceDeletedAt: null,
    frequency: frequency(),
    eligibleFrequencyIds: ['frequency-1', 'frequency-2'],
    validFrom: d('2026-08-01'),
    validUntil: d('2026-09-30'),
    ...overrides,
  }
}

describe('validateAuthorizationDraft', () => {
  it('una autorizacion correcta no tiene violaciones', () => {
    expect(validateAuthorizationDraft(draft())).toEqual([])
  })

  it('solo acepta frecuencias relacionadas con la especialidad', () => {
    // El join especialidad-frecuencia ES el filtro (D11): asignar Medico
    // Clinico no ofrece 100 frecuencias. No es una feature de UI.
    const violations = validateAuthorizationDraft(draft({ eligibleFrequencyIds: ['frequency-9'] }))

    expect(violations).toContain(AuthorizationViolation.FRECUENCIA_NO_ELEGIBLE)
  })

  it('rechaza una frecuencia dada de baja del catalogo', () => {
    const violations = validateAuthorizationDraft(
      draft({ frequency: frequency({ active: false }) }),
    )

    expect(violations).toContain(AuthorizationViolation.FRECUENCIA_INACTIVA)
  })

  it('no autoriza una prestacion dada de baja', () => {
    const violations = validateAuthorizationDraft(draft({ careServiceEndedOn: d('2026-07-01') }))

    expect(violations).toContain(AuthorizationViolation.PRESTACION_DADA_DE_BAJA)
  })

  it('rechaza un periodo que termina antes de empezar', () => {
    const violations = validateAuthorizationDraft(
      draft({ validFrom: d('2026-09-30'), validUntil: d('2026-08-01') }),
    )

    expect(violations).toContain(AuthorizationViolation.PERIODO_INVALIDO)
  })

  it('acepta un periodo de un solo dia', () => {
    const violations = validateAuthorizationDraft(
      draft({ validFrom: d('2026-08-01'), validUntil: d('2026-08-01') }),
    )

    expect(violations).toEqual([])
  })
})

describe('freezeFrequency', () => {
  it('copia el valor, no solo la referencia', () => {
    const catalogo = frequency({ id: 'frequency-7', amount: 10, unit: 'MENSUAL' })

    expect(freezeFrequency(catalogo)).toEqual({
      frequencyId: 'frequency-7',
      frequencyAmount: 10,
      frequencyUnit: 'MENSUAL',
    })
  })

  it('lo congelado no cambia cuando cambia el catalogo', () => {
    // La fuente de que se autorizo en agosto ES la autorizacion. El catalogo es
    // un ayudante de carga, no la verdad.
    const catalogo = frequency({ id: 'frequency-7', amount: 10, unit: 'MENSUAL' })
    const congelada = freezeFrequency(catalogo)

    const catalogoEditado = frequency({ id: 'frequency-7', amount: 4, unit: 'SEMANAL' })

    expect(congelada.frequencyAmount).toBe(10)
    expect(congelada.frequencyUnit).toBe('MENSUAL')
    expect(catalogoEditado.amount).toBe(4)
  })
})
