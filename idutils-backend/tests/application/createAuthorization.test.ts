import { beforeEach, describe, expect, it } from 'vitest'
import { CreateAuthorizationUseCase } from '../../src/application/useCases/authorization/createAuthorizationUseCase.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import { d } from '../helpers/factories.js'
import {
  InMemoryStore,
  createAuthorizationRepository,
  createCareServiceRepository,
  createFrequencyRepository,
  seedCatalog,
} from '../helpers/inMemory.js'

describe('CreateAuthorizationUseCase', () => {
  let store: InMemoryStore
  let careServiceId: string
  let frequencyId: string

  beforeEach(async () => {
    store = new InMemoryStore()
    const catalog = seedCatalog(store)
    frequencyId = catalog.frequencyId

    store.episodes.push({
      id: 'episode-1',
      patientId: 'patient-1',
      affiliationId: 'affiliation-1',
      startsOn: d('2026-08-01'),
      endsOn: null,
      closeReason: null,
      closeNote: null,
      createdAt: d('2026-01-01'),
      updatedAt: d('2026-01-01'),
      deletedAt: null,
    })
    const careService = await createCareServiceRepository(store).create({
      episodeId: 'episode-1',
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.companyId,
      professionalId: catalog.professionalId,
    })
    careServiceId = careService.id
  })

  function useCase(): CreateAuthorizationUseCase {
    return new CreateAuthorizationUseCase(
      createAuthorizationRepository(store),
      createCareServiceRepository(store),
      createFrequencyRepository(store),
    )
  }

  function command() {
    return {
      careServiceId,
      frequencyId,
      validFrom: d('2026-09-01'),
      validUntil: d('2026-09-30'),
      notes: 'Autorización de prueba',
    }
  }

  it('creates through the guarded write and freezes the current frequency', async () => {
    const result = await useCase().execute(command())

    expect(result.authorizationId).toBe(store.authorizations[0]?.id)
    expect(store.authorizations[0]).toMatchObject({
      frequencyId,
      frequencyAmount: 2,
      frequencyUnit: 'SEMANAL',
    })
  })

  it('rejects an authorization when the episode was closed after readable prevalidation', async () => {
    const episode = store.episodes[0]
    if (episode === undefined) throw new Error('expected seeded episode')
    episode.endsOn = d('2026-08-31')

    await expect(useCase().execute(command())).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.AUTHORIZATION.PRESTACION_DADA_DE_BAJA,
    })
    expect(store.authorizations).toHaveLength(0)
  })

  it('preserves the domain message for an invalid period during readable prevalidation', async () => {
    await expect(
      useCase().execute({ ...command(), validFrom: d('2026-10-01') }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.AUTHORIZATION.PERIODO_INVALIDO,
    })
    expect(store.authorizations).toHaveLength(0)
  })
})
