import { beforeEach, describe, expect, it } from 'vitest'
import {
  OpenEpisodeUseCase,
  orderCareServicesForLocking,
} from '../../src/application/useCases/episode/openEpisodeUseCase.js'
import { CloseEpisodeUseCase } from '../../src/application/useCases/episode/closeEpisodeUseCase.js'
import { WorkQueue } from '../../src/domain/enums/workQueue.js'
import {
  CareServiceCreateFailure,
  type CareServiceCreateFailure as CareServiceCreateFailureType,
} from '../../src/domain/repositories/ICareServiceRepository.js'
import type { IUnitOfWork } from '../../src/domain/repositories/IUnitOfWork.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import { AppError } from '../../src/shared/errors/AppError.js'
import { d } from '../helpers/factories.js'
import {
  InMemoryStore,
  InMemoryUnitOfWork,
  createEpisodeRepository,
  createFrequencyRepository,
  createProfessionalRepository,
  seedCatalog,
} from '../helpers/inMemory.js'

interface GuardedFailureCase {
  failure: CareServiceCreateFailureType
  statusCode: number
  message: string
}

const guardedFailureCases: readonly GuardedFailureCase[] = [
  {
    failure: CareServiceCreateFailure.SPECIALTY_NOT_FOUND,
    statusCode: 404,
    message: ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND,
  },
  {
    failure: CareServiceCreateFailure.SPECIALTY_INACTIVE,
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE,
  },
  {
    failure: CareServiceCreateFailure.COMPANY_NOT_FOUND,
    statusCode: 404,
    message: ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND,
  },
  {
    failure: CareServiceCreateFailure.COMPANY_INACTIVE,
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.COMPANY_INACTIVE,
  },
  {
    failure: CareServiceCreateFailure.PROFESSIONAL_NOT_FOUND,
    statusCode: 404,
    message: ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND,
  },
  {
    failure: CareServiceCreateFailure.PROFESSIONAL_INACTIVE,
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE,
  },
  {
    failure: CareServiceCreateFailure.COMPANY_PROVIDER_MISSING,
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.EMPRESA_SIN_CONVENIO,
  },
  {
    failure: CareServiceCreateFailure.PROFESSIONAL_SPECIALTY_MISSING,
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD,
  },
]

describe('OpenEpisodeUseCase', () => {
  let store: InMemoryStore
  let catalog: ReturnType<typeof seedCatalog>
  let useCase: OpenEpisodeUseCase
  let patientId: string
  let affiliationId: string

  beforeEach(async () => {
    store = new InMemoryStore()
    catalog = seedCatalog(store)

    const repositories = new InMemoryUnitOfWork(store)
    useCase = new OpenEpisodeUseCase(
      repositories,
      createProfessionalRepository(store),
      createFrequencyRepository(store),
    )

    await repositories.run(async (repos) => {
      const patient = await repos.patients.create({
        lastName: 'Pérez',
        firstName: 'Juan',
        documentNumber: null,
        birthDate: null,
        addressStreet: 'Rivadavia 4500',
        addressDetail: null,
        localityId: catalog.localityId,
        notes: '',
      })
      patientId = patient.id

      const affiliation = await repos.affiliations.create({
        patientId: patient.id,
        insuranceProviderId: catalog.providerId,
        memberNumber: '123456',
        from: d('2026-08-01'),
      })
      affiliationId = affiliation.id
    })
  })

  function careService(overrides: { companyId?: string; withAuthorization?: boolean } = {}) {
    return {
      specialtyId: catalog.specialtyId,
      contractingCompanyId: overrides.companyId ?? catalog.companyId,
      professionalId: catalog.professionalId,
      authorization:
        overrides.withAuthorization === false
          ? null
          : {
              frequencyId: catalog.frequencyId,
              validFrom: d('2026-08-01'),
              validUntil: d('2026-09-30'),
              notes: 'Aut. 12345',
            },
    }
  }

  it('abre el episodio con su prestacion y su autorizacion', async () => {
    const { episodeId } = await useCase.execute({
      patientId,
      affiliationId,
      startsOn: d('2026-08-01'),
      careServices: [careService()],
    })

    expect(store.episodes).toHaveLength(1)
    expect(store.careServices).toHaveLength(1)
    expect(store.authorizations).toHaveLength(1)
    expect(store.careServices[0]?.episodeId).toBe(episodeId)
  })

  it('procesa prestaciones por una clave global estable sin mutar la entrada', () => {
    const input = [
      { ...careService(), specialtyId: 'specialty-b', professionalId: null },
      { ...careService(), specialtyId: 'specialty-a', contractingCompanyId: 'company-b' },
      {
        ...careService(),
        specialtyId: 'specialty-a',
        contractingCompanyId: 'company-a',
        professionalId: 'professional-b',
      },
      {
        ...careService(),
        specialtyId: 'specialty-a',
        contractingCompanyId: 'company-a',
        professionalId: null,
      },
    ]

    const ordered = orderCareServicesForLocking(input)

    expect(ordered.map((item) => [item.specialtyId, item.contractingCompanyId, item.professionalId]))
      .toEqual([
        ['specialty-a', 'company-a', null],
        ['specialty-a', 'company-a', 'professional-b'],
        ['specialty-a', 'company-b', catalog.professionalId],
        ['specialty-b', catalog.companyId, null],
      ])
    expect(input[0]?.specialtyId).toBe('specialty-b')
  })

  it('congela el valor de la frecuencia en la autorizacion', async () => {
    await useCase.execute({
      patientId,
      affiliationId,
      startsOn: d('2026-08-01'),
      careServices: [careService()],
    })

    expect(store.authorizations[0]).toMatchObject({
      frequencyId: catalog.frequencyId,
      frequencyAmount: 2,
      frequencyUnit: 'SEMANAL',
    })
  })

  it('acepta un episodio con fecha futura: el paciente vuelve el jueves', async () => {
    await useCase.execute({
      patientId,
      affiliationId,
      startsOn: d('2026-09-04'),
      careServices: [],
    })

    expect(store.episodes[0]?.startsOn).toEqual(d('2026-09-04'))
  })

  it('la prestacion puede nacer sin autorizacion mientras se espera el papel', async () => {
    await useCase.execute({
      patientId,
      affiliationId,
      startsOn: d('2026-08-01'),
      careServices: [careService({ withAuthorization: false })],
    })

    expect(store.careServices).toHaveLength(1)
    expect(store.authorizations).toHaveLength(0)
  })

  it('no abre un segundo episodio si ya hay uno abierto', async () => {
    await useCase.execute({ patientId, affiliationId, startsOn: d('2026-08-01'), careServices: [] })

    await expect(
      useCase.execute({ patientId, affiliationId, startsOn: d('2026-08-15'), careServices: [] }),
    ).rejects.toThrow(AppError)
  })

  it('no cuelga un episodio de una afiliacion cerrada', async () => {
    await new InMemoryUnitOfWork(store).run(async (repos) => {
      await repos.affiliations.close(affiliationId, d('2026-08-20'))
    })

    await expect(
      useCase.execute({ patientId, affiliationId, startsOn: d('2026-08-21'), careServices: [] }),
    ).rejects.toThrow(AppError)
  })

  it('impide la prestacion cuando la empresa no tiene convenio con la obra social', async () => {
    // D2 hecho codigo. La empresa existe, pero no llega a esa obra social.
    store.companies.push({
      id: 'company-gamad',
      name: 'Gamad',
      active: true,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      createdAt: d('2026-01-01'),
      updatedAt: d('2026-01-01'),
      deletedAt: null,
    })

    await expect(
      useCase.execute({
        patientId,
        affiliationId,
        startsOn: d('2026-08-01'),
        careServices: [careService({ companyId: 'company-gamad' })],
      }),
    ).rejects.toThrow(AppError)
  })

  it('si una prestacion falla, el episodio entero no queda a medias', async () => {
    store.companies.push({
      id: 'company-gamad',
      name: 'Gamad',
      active: true,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      createdAt: d('2026-01-01'),
      updatedAt: d('2026-01-01'),
      deletedAt: null,
    })

    await expect(
      useCase.execute({
        patientId,
        affiliationId,
        startsOn: d('2026-08-01'),
        careServices: [careService(), careService({ companyId: 'company-gamad' })],
      }),
    ).rejects.toThrow(AppError)

    // Ni el episodio, ni la primera prestacion, ni su autorizacion.
    expect(store.episodes).toHaveLength(0)
    expect(store.careServices).toHaveLength(0)
    expect(store.authorizations).toHaveLength(0)
  })

  it.each(guardedFailureCases)(
    'revierte el episodio cuando el alta protegida falla con $failure',
    async ({ failure, statusCode, message }) => {
      const guardedUnitOfWork: IUnitOfWork = {
        run: (work) =>
          new InMemoryUnitOfWork(store).run((repositories) => {
            repositories.careServices.createGuarded = async () => ({
              careService: null,
              failure,
            })
            return work(repositories)
          }),
      }
      const guardedUseCase = new OpenEpisodeUseCase(
        guardedUnitOfWork,
        createProfessionalRepository(store),
        createFrequencyRepository(store),
      )

      await expect(
        guardedUseCase.execute({
          patientId,
          affiliationId,
          startsOn: d('2026-08-01'),
          careServices: [careService()],
        }),
      ).rejects.toMatchObject({ statusCode, message })

      expect(store.episodes).toHaveLength(0)
      expect(store.careServices).toHaveLength(0)
      expect(store.authorizations).toHaveLength(0)
    },
  )

  it('rechaza la misma especialidad con la misma empresa dos veces', async () => {
    await expect(
      useCase.execute({
        patientId,
        affiliationId,
        startsOn: d('2026-08-01'),
        careServices: [careService(), careService()],
      }),
    ).rejects.toThrow(AppError)
  })
})

describe('CloseEpisodeUseCase', () => {
  it('devuelve la bandeja en la que queda el paciente', async () => {
    const store = new InMemoryStore()
    const catalog = seedCatalog(store)
    const unitOfWork = new InMemoryUnitOfWork(store)

    const episodeId = await unitOfWork.run(async (repos) => {
      const patient = await repos.patients.create({
        lastName: 'Pérez',
        firstName: 'Juan',
        documentNumber: null,
        birthDate: null,
        addressStreet: 'Rivadavia 4500',
        addressDetail: null,
        localityId: catalog.localityId,
        notes: '',
      })
      const affiliation = await repos.affiliations.create({
        patientId: patient.id,
        insuranceProviderId: catalog.providerId,
        memberNumber: '123456',
        from: d('2026-01-01'),
      })
      const episode = await repos.episodes.create({
        patientId: patient.id,
        affiliationId: affiliation.id,
        startsOn: d('2026-01-01'),
      })
      return episode.id
    })

    const useCase = new CloseEpisodeUseCase(createEpisodeRepository(store))

    const result = await useCase.execute({
      episodeId,
      endsOn: d('2026-08-25'),
      closeReason: 'INTERNACION',
      closeNote: 'Sanatorio Anchorena',
    })

    // Que el operador lea "queda en Esperando alta" en el momento de cerrar, y
    // no lo descubra tres dias despues.
    expect(result.queue).toBe(WorkQueue.ESPERANDO_ALTA)
    expect(store.episodes[0]?.closeReason).toBe('INTERNACION')
  })

  it('no cierra un episodio antes de que empiece', async () => {
    const store = new InMemoryStore()
    const catalog = seedCatalog(store)
    const unitOfWork = new InMemoryUnitOfWork(store)

    const episodeId = await unitOfWork.run(async (repos) => {
      const patient = await repos.patients.create({
        lastName: 'Pérez',
        firstName: 'Juan',
        documentNumber: null,
        birthDate: null,
        addressStreet: 'Rivadavia 4500',
        addressDetail: null,
        localityId: catalog.localityId,
        notes: '',
      })
      const affiliation = await repos.affiliations.create({
        patientId: patient.id,
        insuranceProviderId: catalog.providerId,
        memberNumber: '123456',
        from: d('2026-01-01'),
      })
      const episode = await repos.episodes.create({
        patientId: patient.id,
        affiliationId: affiliation.id,
        startsOn: d('2026-08-01'),
      })
      return episode.id
    })

    await expect(
      new CloseEpisodeUseCase(createEpisodeRepository(store)).execute({
        episodeId,
        endsOn: d('2026-07-01'),
        closeReason: 'ALTA_MEDICA',
        closeNote: null,
      }),
    ).rejects.toThrow(AppError)
  })
})
