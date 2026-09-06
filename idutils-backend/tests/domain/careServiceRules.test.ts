import { describe, expect, it } from 'vitest'
import {
  CareServiceViolation,
  CareServiceMutationViolation,
  carryOverForReadmission,
  validateCareServiceDraft,
  validateCareServiceEnd,
  type CareServiceDraft,
} from '../../src/domain/services/careServiceRules.js'
import { d } from '../helpers/factories.js'

function draft(overrides: Partial<CareServiceDraft> = {}): CareServiceDraft {
  return {
    episodeEndsOn: null,
    episodeDeletedAt: null,
    insuranceProviderId: 'swiss',
    contractingCompanyId: 'sanitycare',
    specialtyId: 'kinesiologia-motora',
    professionalId: 'yolanda',
    companyInsuranceProviderIds: ['swiss', 'osde'],
    professionalSpecialtyIds: ['kinesiologia-motora', 'kinesiologia-respiratoria'],
    ...overrides,
  }
}

describe('validateCareServiceDraft', () => {
  it('un alta correcta no tiene violaciones', () => {
    expect(validateCareServiceDraft(draft())).toEqual([])
  })

  it('impide cargar una obra social bajo una empresa sin ese convenio', () => {
    // Es D2 hecho codigo: la coordinacion no tiene contrato con la obra social,
    // llega a traves de la empresa. El sistema lo impide en vez de confiar en
    // el criterio del operador.
    const violations = validateCareServiceDraft(
      draft({ insuranceProviderId: 'pami', companyInsuranceProviderIds: ['swiss'] }),
    )

    expect(violations).toContain(CareServiceViolation.EMPRESA_SIN_CONVENIO)
  })

  it('no cuelga prestaciones de un episodio cerrado', () => {
    const violations = validateCareServiceDraft(draft({ episodeEndsOn: d('2026-08-01') }))

    expect(violations).toContain(CareServiceViolation.EPISODIO_CERRADO)
  })

  it('no asigna un profesional a una especialidad que no tiene habilitada', () => {
    const violations = validateCareServiceDraft(
      draft({ specialtyId: 'fonoaudiologia' }),
    )

    expect(violations).toContain(CareServiceViolation.PROFESIONAL_SIN_ESPECIALIDAD)
  })

  it('sin profesional asignado no valida especialidades: la prestacion existe igual', () => {
    const violations = validateCareServiceDraft(
      draft({ professionalId: null, professionalSpecialtyIds: [] }),
    )

    expect(violations).toEqual([])
  })

  it('devuelve todas las violaciones juntas, no la primera', () => {
    // Un formulario que corrige un error por vez y vuelve a fallar es como se
    // pierde la paciencia del operador.
    const violations = validateCareServiceDraft(
      draft({
        episodeEndsOn: d('2026-08-01'),
        insuranceProviderId: 'pami',
        specialtyId: 'fonoaudiologia',
      }),
    )

    expect(violations).toHaveLength(3)
  })
})

describe('validateCareServiceEnd', () => {
  it('devuelve juntas las violaciones de estado y de línea temporal', () => {
    const violations = validateCareServiceEnd({
      serviceEndedOn: null,
      serviceDeletedAt: null,
      episodeStartsOn: d('2026-02-01'),
      episodeEndsOn: d('2026-02-20'),
      episodeDeletedAt: null,
      endedOn: d('2026-02-21'),
    })

    expect(violations).toEqual([
      CareServiceMutationViolation.EPISODIO_CERRADO,
      CareServiceMutationViolation.ENDS_AFTER_EPISODE_END,
    ])
  })
})

describe('carryOverForReadmission', () => {
  const anteriores = [
    {
      specialtyId: 'kinesiologia-motora',
      contractingCompanyId: 'sanitycare',
      professionalId: 'yolanda',
      endedOn: null,
      deletedAt: null,
    },
    {
      specialtyId: 'enfermeria',
      contractingCompanyId: 'gamad',
      professionalId: null,
      endedOn: null,
      deletedAt: null,
    },
  ]

  it('copia especialidad, empresa y profesional', () => {
    expect(carryOverForReadmission(anteriores)).toEqual([
      {
        specialtyId: 'kinesiologia-motora',
        contractingCompanyId: 'sanitycare',
        professionalId: 'yolanda',
      },
      { specialtyId: 'enfermeria', contractingCompanyId: 'gamad', professionalId: null },
    ])
  })

  it('no arrastra autorizaciones ni frecuencias ni fechas', () => {
    // Nada de eso sobrevive al cierre: es la razon por la que el episodio se
    // cerro. El tipo que devuelve tiene exactamente tres campos, y ninguno es
    // una fecha ni una frecuencia.
    const [first] = carryOverForReadmission(anteriores)

    expect(Object.keys(first ?? {}).sort()).toEqual([
      'contractingCompanyId',
      'professionalId',
      'specialtyId',
    ])
  })

  it('no copia las prestaciones que ya estaban dadas de baja', () => {
    const conBaja = [
      ...anteriores,
      {
        specialtyId: 'fonoaudiologia',
        contractingCompanyId: 'sanitycare',
        professionalId: null,
        endedOn: d('2026-05-01'),
        deletedAt: null,
      },
    ]

    expect(carryOverForReadmission(conBaja)).toHaveLength(2)
  })
})
