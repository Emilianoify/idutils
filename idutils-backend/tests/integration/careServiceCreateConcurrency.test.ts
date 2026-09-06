import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CreateCareServiceUseCase } from '../../src/application/useCases/careService/createCareServiceUseCase.js'
import { OpenEpisodeUseCase } from '../../src/application/useCases/episode/openEpisodeUseCase.js'
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

interface Deferred {
  promise: Promise<void>
  resolve(): void
}

interface LockWaitRow {
  waiting: boolean
}

let client: PrismaClient
let concurrentClient: PrismaClient
let catalog: SeededCatalog
let episodeId: string
let patientId: string
let affiliationId: string

function deferred(): Deferred {
  let resolve = (): void => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function waitForGuardLock(marker: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await client.$queryRaw<LockWaitRow[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND query LIKE ${`%${marker}%`}
          AND wait_event_type = 'Lock'
      ) AS "waiting"
    `
    if (row?.waiting === true) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error(`The guarded create did not wait for ${marker}`)
}

async function proveConcurrentInvalidationIsRejected(
  marker: string,
  mutate: (transaction: Prisma.TransactionClient) => Promise<void>,
  expectedMessage: string,
): Promise<void> {
  const mutationApplied = deferred()
  const releaseMutation = deferred()
  const mutation = concurrentClient.$transaction(async (transaction) => {
    await mutate(transaction)
    mutationApplied.resolve()
    await releaseMutation.promise
  })

  await mutationApplied.promise

  const infrastructure = createInfrastructure(client)
  const useCase = new CreateCareServiceUseCase(
    infrastructure.careServices,
    infrastructure.episodes,
    infrastructure.affiliations,
    infrastructure.specialties,
    infrastructure.contractingCompanies,
    infrastructure.professionals,
  )
  const creation = useCase.execute({
    episodeId,
    specialtyId: catalog.specialtyId,
    contractingCompanyId: catalog.contractingCompanyId,
    professionalId: catalog.professionalId,
  })

  try {
    await waitForGuardLock(marker)
  } finally {
    releaseMutation.resolve()
    await mutation
  }

  await expect(creation).rejects.toMatchObject({ statusCode: 409, message: expectedMessage })
  expect(await client.careService.count()).toBe(0)
}

function openEpisode() {
  const infrastructure = createInfrastructure(client)
  return new OpenEpisodeUseCase(
    infrastructure.unitOfWork,
    infrastructure.professionals,
    infrastructure.frequencies,
  ).execute({
    patientId,
    affiliationId,
    startsOn: new Date('2026-02-01T00:00:00.000Z'),
    careServices: [
      {
        specialtyId: catalog.specialtyId,
        contractingCompanyId: catalog.contractingCompanyId,
        professionalId: catalog.professionalId,
        authorization: null,
      },
    ],
  })
}

async function proveNestedInvalidStateRollsBack(
  invalidate: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  await client.homeCareEpisode.delete({ where: { id: episodeId } })
  await invalidate()

  await expect(openEpisode()).rejects.toMatchObject({ message: expectedMessage })
  expect(await client.homeCareEpisode.count()).toBe(0)
  expect(await client.careService.count()).toBe(0)
}

beforeAll(async () => {
  client = await createTestClient()
  concurrentClient = await createTestClient()
})

afterAll(async () => {
  await client.$disconnect()
  await concurrentClient.$disconnect()
})

beforeEach(async () => {
  await resetDatabase(client)
  catalog = await seedCatalog(client)

  const patient = await client.patient.create({
    data: { lastName: 'Concurrency', addressStreet: 'Test 123', localityId: catalog.localityId },
  })
  const affiliation = await client.affiliation.create({
    data: {
      patientId: patient.id,
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: 'concurrency-create',
      from: new Date('2026-01-01T00:00:00.000Z'),
    },
  })
  patientId = patient.id
  affiliationId = affiliation.id
  const episode = await client.homeCareEpisode.create({
    data: {
      patientId: patient.id,
      affiliationId: affiliation.id,
      startsOn: new Date('2026-02-01T00:00:00.000Z'),
    },
  })
  episodeId = episode.id
})

describe('guarded care-service creation', () => {
  it('rejects a specialty deactivated after prevalidation while waiting for its row lock', async () => {
    await proveConcurrentInvalidationIsRejected(
      'care-service-create:specialty',
      async (transaction) => {
        await transaction.specialty.update({
          where: { id: catalog.specialtyId },
          data: { active: false },
        })
      },
      ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE,
    )
  })

  it('rejects a professional-specialty removal after prevalidation while waiting for its row lock', async () => {
    await proveConcurrentInvalidationIsRejected(
      'care-service-create:professional-specialty',
      async (transaction) => {
        await transaction.professionalSpecialty.update({
          where: {
            professionalId_specialtyId: {
              professionalId: catalog.professionalId,
              specialtyId: catalog.specialtyId,
            },
          },
          data: { deletedAt: new Date() },
        })
      },
      ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD,
    )
  })

  it('rejects deleted nested catalogs and rolls back the episode', async () => {
    await proveNestedInvalidStateRollsBack(
      () =>
        client.specialty.update({
          where: { id: catalog.specialtyId },
          data: { deletedAt: new Date() },
        }),
      ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND,
    )
  })

  it('rejects a deleted nested company and rolls back the episode', async () => {
    await proveNestedInvalidStateRollsBack(
      () =>
        client.contractingCompany.update({
          where: { id: catalog.contractingCompanyId },
          data: { deletedAt: new Date() },
        }),
      ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND,
    )
  })

  it('rejects a deleted nested professional and rolls back the episode', async () => {
    await proveNestedInvalidStateRollsBack(
      () =>
        client.professional.update({
          where: { id: catalog.professionalId },
          data: { deletedAt: new Date() },
        }),
      ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND,
    )
  })

  it('rejects a missing company-provider relationship and rolls back the episode', async () => {
    await proveNestedInvalidStateRollsBack(
      () =>
        client.companyInsuranceProvider.update({
          where: {
            contractingCompanyId_insuranceProviderId: {
              contractingCompanyId: catalog.contractingCompanyId,
              insuranceProviderId: catalog.insuranceProviderId,
            },
          },
          data: { deletedAt: new Date() },
        }),
      ERROR_MESSAGES.CARE_SERVICE.EMPRESA_SIN_CONVENIO,
    )
  })

  it('rejects a missing professional-specialty relationship and rolls back the episode', async () => {
    await proveNestedInvalidStateRollsBack(
      () =>
        client.professionalSpecialty.update({
          where: {
            professionalId_specialtyId: {
              professionalId: catalog.professionalId,
              specialtyId: catalog.specialtyId,
            },
          },
          data: { deletedAt: new Date() },
        }),
      ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD,
    )
  })

  it('rejects nested creation after concurrent invalidation and rolls back the episode', async () => {
    await client.homeCareEpisode.delete({ where: { id: episodeId } })

    const mutationApplied = deferred()
    const releaseMutation = deferred()
    const mutation = concurrentClient.$transaction(async (transaction) => {
      await transaction.specialty.update({
        where: { id: catalog.specialtyId },
        data: { active: false },
      })
      mutationApplied.resolve()
      await releaseMutation.promise
    })
    await mutationApplied.promise

    const opening = openEpisode()

    try {
      await waitForGuardLock('care-service-create:specialty')
    } finally {
      releaseMutation.resolve()
      await mutation
    }

    await expect(opening).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE,
    })
    expect(await client.homeCareEpisode.count()).toBe(0)
    expect(await client.careService.count()).toBe(0)
  })
})
