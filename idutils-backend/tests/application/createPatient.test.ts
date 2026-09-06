import { beforeEach, describe, expect, it } from 'vitest'
import { CreatePatientUseCase } from '../../src/application/useCases/patient/createPatientUseCase.js'
import { LookupAffiliationUseCase } from '../../src/application/useCases/patient/lookupAffiliationUseCase.js'
import { PatientStatus } from '../../src/domain/enums/patientStatus.js'
import { AppError } from '../../src/shared/errors/AppError.js'
import { d } from '../helpers/factories.js'
import {
  FixedClock,
  InMemoryStore,
  InMemoryUnitOfWork,
  createAffiliationRepository,
  createEpisodeRepository,
  createInsuranceProviderRepository,
  createLocalityRepository,
  createPatientRepository,
  seedCatalog,
} from '../helpers/inMemory.js'

const HOY = d('2026-08-28')

describe('CreatePatientUseCase', () => {
  let store: InMemoryStore
  let catalog: ReturnType<typeof seedCatalog>
  let useCase: CreatePatientUseCase

  beforeEach(() => {
    store = new InMemoryStore()
    catalog = seedCatalog(store)
    useCase = new CreatePatientUseCase(
      new InMemoryUnitOfWork(store),
      createInsuranceProviderRepository(store),
      createLocalityRepository(store),
    )
  })

  function command(overrides: { memberNumber?: string } = {}) {
    return {
      lastName: 'Pérez',
      firstName: 'Juan',
      documentNumber: null,
      birthDate: null,
      addressStreet: 'Rivadavia 4500',
      addressDetail: null,
      localityId: catalog.localityId,
      notes: '',
      affiliation: {
        insuranceProviderId: catalog.providerId,
        memberNumber: overrides.memberNumber ?? '00123-456',
        from: d('2026-08-01'),
      },
      contacts: [
        { name: 'María Pérez', relationship: 'hija', phone: '1155551234', isPrimary: true },
      ],
    }
  }

  it('crea el paciente con su afiliacion en un solo movimiento', async () => {
    const result = await useCase.execute(command())

    expect(store.patients).toHaveLength(1)
    expect(store.affiliations).toHaveLength(1)
    expect(store.contacts).toHaveLength(1)
    expect(result.insuranceProviderName).toBe('Swiss Medical')
  })

  it('el paciente nace SIN_INICIAR: existe, pero todavia no tiene episodio', async () => {
    const result = await useCase.execute(command())

    expect(result.status).toBe(PatientStatus.SIN_INICIAR)
    expect(store.episodes).toHaveLength(0)
  })

  it('normaliza el numero de afiliado antes de guardarlo', async () => {
    await useCase.execute(command({ memberNumber: '00123-456' }))

    expect(store.affiliations[0]?.memberNumber).toBe('123456')
  })

  it('no deja duplicar una afiliacion vigente y explica que hacer', async () => {
    await useCase.execute(command({ memberNumber: '123456' }))

    // Mismo numero escrito distinto: el Excel los ve como dos, el sistema no.
    await expect(useCase.execute(command({ memberNumber: '000123.456' }))).rejects.toThrow(AppError)
  })

  it('si la afiliacion esta tomada NO queda el paciente creado a medias', async () => {
    // Esta es la razon por la que el alta va en transaccion. Sin rollback
    // quedaria un paciente sin cobertura que despues nadie sabe de donde salio.
    await useCase.execute(command({ memberNumber: '123456' }))

    await expect(useCase.execute(command({ memberNumber: '123456' }))).rejects.toThrow(AppError)

    expect(store.patients).toHaveLength(1)
    expect(store.affiliations).toHaveLength(1)
    expect(store.contacts).toHaveLength(1)
  })

  it('rechaza una obra social o una localidad que no existen', async () => {
    await expect(
      useCase.execute({
        ...command(),
        affiliation: { ...command().affiliation, insuranceProviderId: 'provider-inventado' },
      }),
    ).rejects.toThrow(AppError)

    await expect(
      useCase.execute({ ...command(), localityId: 'locality-inventada' }),
    ).rejects.toThrow(AppError)
  })

  it('no acepta dos contactos principales', async () => {
    // "El principal" en singular. Dos es lo mismo que ninguno: hay que elegir
    // a mano igual, que es lo que la lista de contactos vino a evitar.
    await expect(
      useCase.execute({
        ...command(),
        contacts: [
          { name: 'María', relationship: 'hija', phone: '1', isPrimary: true },
          { name: 'Carlos', relationship: 'hijo', phone: '2', isPrimary: true },
        ],
      }),
    ).rejects.toThrow(AppError)

    expect(store.patients).toHaveLength(0)
  })
})

describe('LookupAffiliationUseCase', () => {
  it('encuentra al paciente que ya tiene esa afiliacion, para vincular a mano', async () => {
    const store = new InMemoryStore()
    const catalog = seedCatalog(store)

    await new CreatePatientUseCase(
      new InMemoryUnitOfWork(store),
      createInsuranceProviderRepository(store),
      createLocalityRepository(store),
    ).execute({
      lastName: 'Pérez',
      firstName: 'Juan',
      documentNumber: null,
      birthDate: null,
      addressStreet: 'Rivadavia 4500',
      addressDetail: null,
      localityId: catalog.localityId,
      notes: '',
      affiliation: {
        insuranceProviderId: catalog.providerId,
        memberNumber: '123456',
        from: d('2026-08-01'),
      },
      contacts: [],
    })

    const lookup = new LookupAffiliationUseCase(
      createAffiliationRepository(store),
      createPatientRepository(store),
      createEpisodeRepository(store),
      createInsuranceProviderRepository(store),
      new FixedClock(HOY),
    )

    // El operador escribe el número como se lo dictaron, con ceros y guion.
    const found = await lookup.execute(catalog.providerId, '00123-456')

    expect(found.found).toBe(true)
    expect(found.patient?.lastName).toBe('Pérez')
    expect(found.patient?.status).toBe(PatientStatus.SIN_INICIAR)

    const missing = await lookup.execute(catalog.providerId, '999999')
    expect(missing.found).toBe(false)
    expect(missing.patient).toBeNull()
  })
})
