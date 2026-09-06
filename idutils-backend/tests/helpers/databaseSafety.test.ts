import { describe, expect, it, vi } from 'vitest'
import {
  assertDistinctDatabaseIdentities,
  type DatabaseIdentity,
} from './databaseSafety.js'
import { quotePostgresIdentifier, resetDatabase } from '../integration/helpers/database.js'

const TEST_URL = 'postgresql://test-user:test-secret@localhost:5432/idutils?schema=public'
const APP_ALIAS_URL =
  'postgresql://app-user:app-secret@127.0.0.1:5432/idutils?application_name=idutils'

const TEST_IDENTITY: DatabaseIdentity = {
  systemIdentifier: '741852963',
  databaseOid: '16401',
}

describe('seguridad de la base de tests de integración', () => {
  it('rechaza URLs textualmente distintas que resuelven a la misma base PostgreSQL', async () => {
    const probe = vi.fn().mockResolvedValue(TEST_IDENTITY)

    await expect(
      assertDistinctDatabaseIdentities(
        { testUrl: TEST_URL, appUrl: APP_ALIAS_URL },
        probe,
      ),
    ).rejects.toThrow('apuntan a la misma base PostgreSQL')

    expect(probe).toHaveBeenNthCalledWith(1, TEST_URL)
    expect(probe).toHaveBeenNthCalledWith(2, APP_ALIAS_URL)
  })

  it('acepta únicamente identidades PostgreSQL distintas', async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(TEST_IDENTITY)
      .mockResolvedValueOnce({ ...TEST_IDENTITY, databaseOid: '16402' })

    await expect(
      assertDistinctDatabaseIdentities({ testUrl: TEST_URL, appUrl: APP_ALIAS_URL }, probe),
    ).resolves.toBeUndefined()
  })

  it.each([
    { testUrl: undefined, appUrl: APP_ALIAS_URL, missing: 'TEST_DATABASE_URL' },
    { testUrl: '   ', appUrl: APP_ALIAS_URL, missing: 'TEST_DATABASE_URL' },
    { testUrl: TEST_URL, appUrl: undefined, missing: 'DATABASE_URL' },
    { testUrl: TEST_URL, appUrl: '', missing: 'DATABASE_URL' },
  ])('falla cerrado sin $missing y no inicia ningún probe', async (input) => {
    const probe = vi.fn()

    await expect(assertDistinctDatabaseIdentities(input, probe)).rejects.toThrow(input.missing)
    expect(probe).not.toHaveBeenCalled()
  })

  it('oculta credenciales cuando una URL o conexión no se puede verificar', async () => {
    const leakedDriverError = `invalid connection string: ${TEST_URL}`
    const probe = vi.fn().mockRejectedValue(new Error(leakedDriverError))

    const failure = assertDistinctDatabaseIdentities(
      { testUrl: TEST_URL, appUrl: APP_ALIAS_URL },
      probe,
    )

    await expect(failure).rejects.toThrow('No se pudo comprobar de forma segura')
    await expect(failure).rejects.not.toThrow('test-secret')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('falla cerrado si el probe devuelve una identidad incompleta', async () => {
    const probe = vi.fn().mockResolvedValue({ ...TEST_IDENTITY, systemIdentifier: '' })

    await expect(
      assertDistinctDatabaseIdentities({ testUrl: TEST_URL, appUrl: APP_ALIAS_URL }, probe),
    ).rejects.toThrow('No se pudo comprobar de forma segura')
  })

  it('rechaza un cliente no verificado antes de descubrir tablas', async () => {
    const unverifiedClient = {
      $queryRaw: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    }

    // @ts-expect-error El objeto incompleto prueba el límite de seguridad en runtime.
    await expect(resetDatabase(unverifiedClient)).rejects.toThrow('no fue verificada')
    expect(unverifiedClient.$queryRaw).not.toHaveBeenCalled()
    expect(unverifiedClient.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it('escapa comillas dobles al construir identificadores PostgreSQL', () => {
    expect(quotePostgresIdentifier('care"services')).toBe('"care""services"')
  })
})
