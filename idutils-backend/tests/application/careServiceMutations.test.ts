import { describe, expect, it } from 'vitest'
import { AssignCareServiceProfessionalUseCase } from '../../src/application/useCases/careService/assignCareServiceProfessionalUseCase.js'
import { CreateCareServiceUseCase } from '../../src/application/useCases/careService/createCareServiceUseCase.js'
import { EndCareServiceUseCase } from '../../src/application/useCases/careService/endCareServiceUseCase.js'
import { ServiceUnit } from '../../src/generated/prisma/enums.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import { d } from '../helpers/factories.js'
import {
  createAffiliationRepository,
  createCareServiceRepository,
  createContractingCompanyRepository,
  createEpisodeRepository,
  createProfessionalRepository,
  createSpecialtyRepository,
  FixedClock,
  InMemoryStore,
} from '../helpers/inMemory.js'

const EPOCH = d('2026-01-01')

/** El "hoy" por defecto: bien despues del episodio, para no depender del reloj real. */
const TODAY = d('2026-03-01')

function harness(today: Date = TODAY) {
  const store = new InMemoryStore()
  store.affiliations.push({
    id: 'affiliation',
    patientId: 'patient',
    insuranceProviderId: 'provider',
    memberNumber: '123',
    from: d('2026-01-01'),
    to: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  })
  store.episodes.push({
    id: 'episode',
    patientId: 'patient',
    affiliationId: 'affiliation',
    startsOn: d('2026-02-01'),
    endsOn: null,
    closeReason: null,
    closeNote: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  })
  store.specialties.push({
    id: 'specialty',
    name: 'Kinesiología',
    serviceUnit: ServiceUnit.SESION,
    active: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  })
  store.companies.push({
    id: 'company',
    name: 'Empresa',
    active: true,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  })
  store.professionals.push({
    id: 'professional',
    lastName: 'Gómez',
    firstName: 'Yolanda',
    documentNumber: null,
    licenseNumber: null,
    phone: null,
    email: null,
    taxId: null,
    bankAccount: null,
    bankAlias: null,
    active: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  })
  store.companyProviders.push({ contractingCompanyId: 'company', insuranceProviderId: 'provider' })
  store.professionalSpecialties.push({
    professionalId: 'professional',
    specialtyId: 'specialty',
  })

  const careServices = createCareServiceRepository(store)
  const episodes = createEpisodeRepository(store)
  const professionals = createProfessionalRepository(store)
  const clock = new FixedClock(today)

  return {
    store,
    create: new CreateCareServiceUseCase(
      careServices,
      episodes,
      createAffiliationRepository(store),
      createSpecialtyRepository(store),
      createContractingCompanyRepository(store),
      professionals,
    ),
    assign: new AssignCareServiceProfessionalUseCase(
      careServices,
      episodes,
      professionals,
      clock,
    ),
    end: new EndCareServiceUseCase(careServices, episodes, clock),
  }
}

async function createService(setup: ReturnType<typeof harness>): Promise<string> {
  const result = await setup.create.execute({
    episodeId: 'episode',
    specialtyId: 'specialty',
    contractingCompanyId: 'company',
    professionalId: 'professional',
  })
  return result.careServiceId
}

describe('CreateCareServiceUseCase', () => {
  it.each([
    {
      name: 'especialidad inactiva',
      mutate: (store: InMemoryStore) => {
        const specialty = store.specialties[0]
        if (specialty !== undefined) specialty.active = false
      },
      message: ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE,
    },
    {
      name: 'empresa inactiva',
      mutate: (store: InMemoryStore) => {
        const company = store.companies[0]
        if (company !== undefined) company.active = false
      },
      message: ERROR_MESSAGES.CARE_SERVICE.COMPANY_INACTIVE,
    },
    {
      name: 'profesional inactivo',
      mutate: (store: InMemoryStore) => {
        const professional = store.professionals[0]
        if (professional !== undefined) professional.active = false
      },
      message: ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE,
    },
  ])('rechaza $name', async ({ mutate, message }) => {
    const setup = harness()
    mutate(setup.store)

    await expect(createService(setup)).rejects.toMatchObject({ statusCode: 409, message })
    expect(setup.store.careServices).toHaveLength(0)
  })

  it.each([
    {
      name: 'especialidad',
      mutate: (store: InMemoryStore) => {
        const specialty = store.specialties[0]
        if (specialty !== undefined) specialty.deletedAt = EPOCH
      },
      message: ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND,
    },
    {
      name: 'empresa',
      mutate: (store: InMemoryStore) => {
        const company = store.companies[0]
        if (company !== undefined) company.deletedAt = EPOCH
      },
      message: ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND,
    },
    {
      name: 'profesional',
      mutate: (store: InMemoryStore) => {
        const professional = store.professionals[0]
        if (professional !== undefined) professional.deletedAt = EPOCH
      },
      message: ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND,
    },
  ])('trata $name con baja lógica como inexistente', async ({ mutate, message }) => {
    const setup = harness()
    mutate(setup.store)

    await expect(createService(setup)).rejects.toMatchObject({ statusCode: 404, message })
    expect(setup.store.careServices).toHaveLength(0)
  })
})

describe('AssignCareServiceProfessionalUseCase', () => {
  it('rechaza un profesional inactivo o incompatible', async () => {
    const setup = harness()
    const careServiceId = await createService(setup)
    const professional = setup.store.professionals[0]
    if (professional !== undefined) professional.active = false

    await expect(setup.assign.execute(careServiceId, 'professional')).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE,
    })

    if (professional !== undefined) professional.active = true
    setup.store.professionalSpecialties.length = 0
    await expect(setup.assign.execute(careServiceId, 'professional')).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD,
    })
  })

  it('no permite ni desasignar una prestación finalizada o de un episodio cerrado', async () => {
    const setup = harness()
    const careServiceId = await createService(setup)
    const service = setup.store.careServices[0]
    if (service !== undefined) service.endedOn = d('2026-02-10')

    await expect(setup.assign.execute(careServiceId, null)).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.ALREADY_ENDED,
    })

    if (service !== undefined) service.endedOn = null
    const episode = setup.store.episodes[0]
    if (episode !== undefined) episode.endsOn = d('2026-02-20')
    await expect(setup.assign.execute(careServiceId, null)).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.EPISODIO_CERRADO,
    })
  })

  it('un cierre PROGRAMADO deja seguir asignando hasta ese día', async () => {
    // El tablero muestra este episodio como activo porque cubre la fecha. Si
    // la escritura lo tratara como cerrado, el sistema estaría ofreciendo un
    // trabajo que después rechaza.
    const setup = harness(d('2026-02-19'))
    const careServiceId = await createService(setup)
    const episode = setup.store.episodes[0]
    if (episode !== undefined) episode.endsOn = d('2026-02-20')

    const updated = await setup.assign.execute(careServiceId, null)

    expect(updated.professionalId).toBeNull()
  })
})

describe('EndCareServiceUseCase', () => {
  it('rechaza una baja anterior al inicio del episodio', async () => {
    const setup = harness()
    const careServiceId = await createService(setup)

    await expect(setup.end.execute(careServiceId, d('2026-01-31'))).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.ENDS_BEFORE_EPISODE_START,
    })
  })

  it('rechaza un episodio cerrado y denuncia una fecha posterior a su cierre', async () => {
    const setup = harness()
    const careServiceId = await createService(setup)
    const episode = setup.store.episodes[0]
    if (episode !== undefined) episode.endsOn = d('2026-02-20')

    await expect(setup.end.execute(careServiceId, d('2026-02-21'))).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.EPISODIO_CERRADO,
      details: expect.arrayContaining([ERROR_MESSAGES.CARE_SERVICE.ENDS_AFTER_EPISODE_END]),
    })
  })

  it('un cierre PROGRAMADO deja dar de baja una prestación adentro del episodio', async () => {
    const setup = harness(d('2026-02-19'))
    const careServiceId = await createService(setup)
    const episode = setup.store.episodes[0]
    if (episode !== undefined) episode.endsOn = d('2026-02-20')

    const updated = await setup.end.execute(careServiceId, d('2026-02-19'))

    expect(updated.endedOn).toEqual(d('2026-02-19'))
  })

  it('rechaza una segunda baja', async () => {
    const setup = harness()
    const careServiceId = await createService(setup)
    await setup.end.execute(careServiceId, d('2026-02-10'))

    await expect(setup.end.execute(careServiceId, d('2026-02-11'))).rejects.toMatchObject({
      message: ERROR_MESSAGES.CARE_SERVICE.ALREADY_ENDED,
    })
  })
})
