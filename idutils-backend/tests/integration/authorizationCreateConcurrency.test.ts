import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CreateAuthorizationUseCase } from '../../src/application/useCases/authorization/createAuthorizationUseCase.js'
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
let careServiceId: string
let episodeId: string

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
  throw new Error(`The guarded authorization did not wait for ${marker}`)
}

function createAuthorization() {
  const infrastructure = createInfrastructure(client)
  return new CreateAuthorizationUseCase(
    infrastructure.authorizations,
    infrastructure.careServices,
    infrastructure.frequencies,
    infrastructure.clock,
  ).execute({
    careServiceId,
    frequencyId: catalog.frequencyId,
    validFrom: new Date('2026-02-01T00:00:00.000Z'),
    validUntil: new Date('2026-02-28T00:00:00.000Z'),
    notes: 'Concurrent authorization',
  })
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

  const creation = createAuthorization()
  try {
    await waitForGuardLock(marker)
  } finally {
    releaseMutation.resolve()
    await mutation
  }

  await expect(creation).rejects.toMatchObject({ statusCode: 409, message: expectedMessage })
  expect(await client.authorization.count()).toBe(0)
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
    data: { lastName: 'Authorization', addressStreet: 'Test 123', localityId: catalog.localityId },
  })
  const affiliation = await client.affiliation.create({
    data: {
      patientId: patient.id,
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: 'authorization-concurrency',
      from: new Date('2026-01-01T00:00:00.000Z'),
    },
  })
  const episode = await client.homeCareEpisode.create({
    data: {
      patientId: patient.id,
      affiliationId: affiliation.id,
      startsOn: new Date('2026-01-01T00:00:00.000Z'),
    },
  })
  episodeId = episode.id
  const careService = await client.careService.create({
    data: {
      episodeId,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: catalog.professionalId,
    },
  })
  careServiceId = careService.id
})

describe('guarded authorization creation', () => {
  it('rejects invalid periods at the write boundary without inserting', async () => {
    const infrastructure = createInfrastructure(client)
    const result = await infrastructure.authorizations.createGuarded({
      careServiceId,
      frequencyId: catalog.frequencyId,
      validFrom: new Date('2026-03-01T00:00:00.000Z'),
      validUntil: new Date('2026-02-28T00:00:00.000Z'),
      notes: '',
      asOf: infrastructure.clock.today(),
    })

    expect(result).toMatchObject({ authorization: null, failure: 'INVALID_PERIOD' })
    expect(await client.authorization.count()).toBe(0)
  })

  it('rejects a closed episode even when the care service remains active', async () => {
    await client.homeCareEpisode.update({
      where: { id: episodeId },
      data: { endsOn: new Date('2026-01-31T00:00:00.000Z'), closeReason: 'ALTA_MEDICA' },
    })

    await expect(createAuthorization()).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.AUTHORIZATION.PRESTACION_DADA_DE_BAJA,
    })
    expect(await client.authorization.count()).toBe(0)
  })

  it('rejects an episode closed after prevalidation while waiting for its lock', async () => {
    await proveConcurrentInvalidationIsRejected(
      'authorization-create:episode',
      (transaction) =>
        transaction.homeCareEpisode.update({
          where: { id: episodeId },
          data: { endsOn: new Date('2026-01-31T00:00:00.000Z'), closeReason: 'ALTA_MEDICA' },
        }).then(() => undefined),
      ERROR_MESSAGES.AUTHORIZATION.PRESTACION_DADA_DE_BAJA,
    )
  })

  it('rejects eligibility removed after prevalidation while waiting for its lock', async () => {
    await proveConcurrentInvalidationIsRejected(
      'authorization-create:specialty-frequency',
      (transaction) =>
        transaction.specialtyFrequency.update({
          where: {
            specialtyId_frequencyId: {
              specialtyId: catalog.specialtyId,
              frequencyId: catalog.frequencyId,
            },
          },
          data: { deletedAt: new Date() },
        }).then(() => undefined),
      ERROR_MESSAGES.AUTHORIZATION.FRECUENCIA_NO_ELEGIBLE,
    )
  })
})
