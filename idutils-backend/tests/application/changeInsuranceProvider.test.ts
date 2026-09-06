import { beforeEach, describe, expect, it } from 'vitest'
import { ChangeInsuranceProviderUseCase } from '../../src/application/useCases/affiliation/changeInsuranceProviderUseCase.js'
import { GetPatientDetailUseCase } from '../../src/application/useCases/patient/getPatientDetailUseCase.js'
import { PatientStatus } from '../../src/domain/enums/patientStatus.js'
import { WorkQueue } from '../../src/domain/enums/workQueue.js'
import { AppError } from '../../src/shared/errors/AppError.js'
import { d } from '../helpers/factories.js'
import {
  FixedClock,
  InMemoryStore,
  InMemoryUnitOfWork,
  createAffiliationRepository,
  createEpisodeRepository,
  createInsuranceProviderRepository,
  createPatientRepository,
  seedCatalog,
} from '../helpers/inMemory.js'

const HOY = d('2026-08-28')

describe('ChangeInsuranceProviderUseCase', () => {
  let store: InMemoryStore
  let catalog: ReturnType<typeof seedCatalog>
  let useCase: ChangeInsuranceProviderUseCase
  let patientId: string

  beforeEach(async () => {
    store = new InMemoryStore()
    catalog = seedCatalog(store)

    store.providers.push({
      id: 'provider-osde',
      name: 'OSDE',
      active: true,
      createdAt: d('2026-01-01'),
      updatedAt: d('2026-01-01'),
      deletedAt: null,
    })

    const unitOfWork = new InMemoryUnitOfWork(store)

    await unitOfWork.run(async (repos) => {
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
        from: d('2026-01-01'),
      })

      await repos.episodes.create({
        patientId: patient.id,
        affiliationId: affiliation.id,
        startsOn: d('2026-01-15'),
      })
    })

    useCase = new ChangeInsuranceProviderUseCase(
      unitOfWork,
      createInsuranceProviderRepository(store),
    )
  })

  it('cierra la afiliacion y el episodio, y abre la afiliacion nueva', async () => {
    const result = await useCase.execute({
      patientId,
      insuranceProviderId: 'provider-osde',
      memberNumber: '00987-654',
      changedOn: d('2026-08-20'),
    })

    expect(store.affiliations).toHaveLength(2)
    expect(store.affiliations[0]?.to).toEqual(d('2026-08-20'))
    expect(store.affiliations[1]?.memberNumber).toBe('987654')

    expect(store.episodes[0]?.endsOn).toEqual(d('2026-08-20'))
    expect(store.episodes[0]?.closeReason).toBe('CAMBIO_OBRA_SOCIAL')

    expect(result.status).toBe(PatientStatus.PENDIENTE_REAUTORIZACION)
  })

  it('NO abre un episodio nuevo: la obra social nueva puede autorizar otra cosa', async () => {
    await useCase.execute({
      patientId,
      insuranceProviderId: 'provider-osde',
      memberNumber: '987654',
      changedOn: d('2026-08-20'),
    })

    expect(store.episodes).toHaveLength(1)
    expect(store.episodes.filter((episode) => episode.endsOn === null)).toHaveLength(0)
  })

  it('el paciente NO se duplica: es la misma persona con otra cobertura', async () => {
    await useCase.execute({
      patientId,
      insuranceProviderId: 'provider-osde',
      memberNumber: '987654',
      changedOn: d('2026-08-20'),
    })

    // Esto es lo que el Excel no puede hacer, y donde hoy se pierde el historial.
    expect(store.patients).toHaveLength(1)

    const detail = await new GetPatientDetailUseCase(
      createPatientRepository(store),
      createAffiliationRepository(store),
      createEpisodeRepository(store),
      createInsuranceProviderRepository(store),
      new FixedClock(HOY),
    ).execute(patientId)

    expect(detail.affiliations).toHaveLength(2)
    expect(detail.affiliations.filter((affiliation) => affiliation.isCurrent)).toHaveLength(1)
    expect(detail.status).toBe(PatientStatus.PENDIENTE_REAUTORIZACION)
    expect(detail.workQueue).toBe(WorkQueue.REAUTORIZAR)
  })

  it('si el numero nuevo ya esta tomado no queda nada a medias', async () => {
    // Otro paciente con ese afiliado en OSDE.
    await new InMemoryUnitOfWork(store).run(async (repos) => {
      const otro = await repos.patients.create({
        lastName: 'Gómez',
        firstName: 'Ana',
        documentNumber: null,
        birthDate: null,
        addressStreet: 'Otra 100',
        addressDetail: null,
        localityId: catalog.localityId,
        notes: '',
      })
      await repos.affiliations.create({
        patientId: otro.id,
        insuranceProviderId: 'provider-osde',
        memberNumber: '987654',
        from: d('2026-01-01'),
      })
    })

    await expect(
      useCase.execute({
        patientId,
        insuranceProviderId: 'provider-osde',
        memberNumber: '987654',
        changedOn: d('2026-08-20'),
      }),
    ).rejects.toThrow(AppError)

    // La afiliacion anterior sigue vigente y el episodio sigue abierto: sin
    // rollback quedaria un episodio abierto colgado de una afiliacion cerrada,
    // que es un estado que el modelo declara imposible.
    const original = store.affiliations.find((affiliation) => affiliation.patientId === patientId)
    expect(original?.to).toBeNull()
    expect(store.episodes[0]?.endsOn).toBeNull()
  })
})
