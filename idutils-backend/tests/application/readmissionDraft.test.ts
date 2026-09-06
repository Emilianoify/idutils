import { beforeEach, describe, expect, it } from 'vitest'
import { BuildReadmissionDraftUseCase } from '../../src/application/useCases/episode/buildReadmissionDraftUseCase.js'
import { d } from '../helpers/factories.js'
import {
  InMemoryStore,
  InMemoryUnitOfWork,
  createAffiliationRepository,
  createCareServiceRepository,
  createContractingCompanyRepository,
  createEpisodeRepository,
  createProfessionalRepository,
  createSpecialtyRepository,
  seedCatalog,
} from '../helpers/inMemory.js'

describe('BuildReadmissionDraftUseCase', () => {
  let store: InMemoryStore
  let catalog: ReturnType<typeof seedCatalog>
  let useCase: BuildReadmissionDraftUseCase
  let patientId: string

  beforeEach(async () => {
    store = new InMemoryStore()
    catalog = seedCatalog(store)

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

      const episode = await repos.episodes.create({
        patientId: patient.id,
        affiliationId: affiliation.id,
        startsOn: d('2026-01-15'),
      })

      await repos.careServices.create({
        episodeId: episode.id,
        specialtyId: catalog.specialtyId,
        contractingCompanyId: catalog.companyId,
        professionalId: catalog.professionalId,
      })

      await repos.episodes.close(episode.id, {
        endsOn: d('2026-08-25'),
        closeReason: 'INTERNACION',
      })
    })

    useCase = new BuildReadmissionDraftUseCase(
      createEpisodeRepository(store),
      createCareServiceRepository(store),
      createAffiliationRepository(store),
      createSpecialtyRepository(store),
      createContractingCompanyRepository(store),
      createProfessionalRepository(store),
    )
  })

  it('propone especialidad, empresa y profesional del episodio anterior', async () => {
    const draft = await useCase.execute(patientId)

    expect(draft.careServices).toHaveLength(1)
    expect(draft.careServices[0]).toMatchObject({
      specialtyName: 'Kinesiología Motora',
      contractingCompanyName: 'SanityCare',
      professionalName: 'Gómez, Yolanda',
      stillValid: true,
    })
  })

  it('no escribe nada: es una propuesta, no un hecho', async () => {
    const episodesBefore = store.episodes.length
    const careServicesBefore = store.careServices.length

    await useCase.execute(patientId)

    expect(store.episodes).toHaveLength(episodesBefore)
    expect(store.careServices).toHaveLength(careServicesBefore)
  })

  it('marca lo que ya no sirve en vez de dejar que falle al confirmar', async () => {
    // El paciente vuelve con otra obra social: la empresa de antes puede no
    // tener convenio con la nueva.
    store.providers.push({
      id: 'provider-osde',
      name: 'OSDE',
      active: true,
      createdAt: d('2026-01-01'),
      updatedAt: d('2026-01-01'),
      deletedAt: null,
    })

    await new InMemoryUnitOfWork(store).run(async (repos) => {
      const current = await repos.affiliations.findCurrentByPatient(patientId)
      if (current !== null) await repos.affiliations.close(current.id, d('2026-08-26'))

      await repos.affiliations.create({
        patientId,
        insuranceProviderId: 'provider-osde',
        memberNumber: '987654',
        from: d('2026-08-26'),
      })
    })

    const draft = await useCase.execute(patientId)

    expect(draft.careServices[0]?.stillValid).toBe(false)
    expect(draft.warnings).toHaveLength(1)
  })
})
