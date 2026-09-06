import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { PrismaClient } from '../../../src/generated/prisma/client.js'
import { createPrismaClient } from '../../../src/infrastructure/database/prismaClient.js'
import {
  assertDistinctDatabaseIdentities,
  type DatabaseIdentity,
} from '../../helpers/databaseSafety.js'
import {
  assertMigrationHistoryCurrent,
  type ExpectedMigration,
  type MigrationLedgerRow,
} from '../../helpers/migrationSafety.js'

/**
 * Andamiaje de los tests que tocan Postgres de verdad.
 *
 * Existen aparte de los tests unitarios porque prueban otra cosa: los
 * unitarios prueban las REGLAS contra fakes en memoria; estos prueban que los
 * adaptadores traduzcan bien contra la base real, incluido lo que ningun fake
 * puede simular —el EXCLUDE, los indices unicos parciales y el rollback.
 *
 * Corren con `pnpm test:integration` y no con `pnpm test` a proposito: el
 * comando que tiene que estar verde en cualquier maquina no puede depender de
 * que haya un Postgres levantado.
 */

/**
 * El cliente de los tests, contra la base de TESTS.
 *
 * `TEST_DATABASE_URL` es obligatoria y tiene que ser DISTINTA de
 * `DATABASE_URL`. No es burocracia: `resetDatabase` hace TRUNCATE de todas
 * las tablas. Apuntado a la base de trabajo, un `pnpm test:integration`
 * corrido sin pensar borra los pacientes de la coordinacion, no falla, y nadie
 * se entera hasta que alguien abre el dashboard.
 *
 * Por eso falla CERRADO: sin la variable no corre, en vez de caer en silencio
 * sobre la base equivocada.
 */
const verifiedTestClients = new WeakSet<PrismaClient>()

interface DatabaseIdentityRow {
  systemIdentifier: string
  databaseOid: string
}

async function expectedMigrations(): Promise<ExpectedMigration[]> {
  const migrationsUrl = new URL('../../../prisma/migrations/', import.meta.url)
  const entries = await readdir(migrationsUrl, {
    withFileTypes: true,
  })
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(`${name}/migration.sql`, migrationsUrl))
      return { name, checksum: createHash('sha256').update(sql).digest('hex') }
    }),
  )
}

async function assertTestMigrationsCurrent(client: PrismaClient): Promise<void> {
  try {
    const [expected, ledger] = await Promise.all([
      expectedMigrations(),
      client.$queryRaw<MigrationLedgerRow[]>`
        SELECT migration_name AS "migrationName",
               checksum,
               finished_at AS "finishedAt",
               rolled_back_at AS "rolledBackAt"
        FROM "_prisma_migrations"
      `,
    ])
    assertMigrationHistoryCurrent(expected, ledger)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('La base de tests no tiene')) {
      throw error
    }
    throw new Error(
      'No se pudo verificar de forma segura el historial de migraciones de la base de tests.',
    )
  }
}

async function probeDatabaseIdentity(connectionString: string): Promise<DatabaseIdentity> {
  const client = createPrismaClient(connectionString)

  try {
    const rows = await client.$queryRaw<DatabaseIdentityRow[]>`
      SELECT control.system_identifier::text AS "systemIdentifier",
             database.oid::text AS "databaseOid"
      FROM pg_control_system() AS control
      CROSS JOIN pg_database AS database
      WHERE database.datname = current_database()
    `

    const identity = rows[0]
    if (rows.length !== 1 || identity === undefined) {
      throw new Error('PostgreSQL no devolvió una identidad única')
    }

    return identity
  } finally {
    await client.$disconnect()
  }
}

export async function createTestClient(): Promise<PrismaClient> {
  const testUrl = process.env.TEST_DATABASE_URL
  const appUrl = process.env.DATABASE_URL

  await assertDistinctDatabaseIdentities({ testUrl, appUrl }, probeDatabaseIdentity)

  const client = createPrismaClient(testUrl)
  try {
    await assertTestMigrationsCurrent(client)
  } catch (error) {
    await client.$disconnect()
    throw error
  }
  verifiedTestClients.add(client)
  return client
}

/**
 * Deja la base vacia entre tests.
 *
 * Se descubren las tablas en vez de listarlas a mano: una lista escrita queda
 * desactualizada al primer modelo nuevo, y el test que falla despues no dice
 * "falta truncar", dice cualquier otra cosa.
 *
 * `_prisma_migrations` queda afuera: borrarla haria que Prisma crea que la base
 * no esta migrada.
 */
export async function resetDatabase(client: PrismaClient): Promise<void> {
  if (!verifiedTestClients.has(client)) {
    throw new Error(
      'La base de tests no fue verificada. Se rechazó el reset antes de consultar sus tablas.',
    )
  }

  const tables = await client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `

  if (tables.length === 0) return

  const names = tables.map((table) => quotePostgresIdentifier(table.tablename)).join(', ')
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`)
}

export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export interface SeededCatalog {
  provinceId: string
  localityId: string
  insuranceProviderId: string
  contractingCompanyId: string
  specialtyId: string
  frequencyId: string
  professionalId: string
}

/**
 * Catalogos minimos y COHERENTES: la empresa tiene convenio con la obra
 * social, la frecuencia esta habilitada para la especialidad y el profesional
 * tiene esa especialidad. Sin esas tres relaciones, cualquier alta de
 * prestacion es rechazada por una regla y el test falla por el motivo
 * equivocado.
 */
export async function seedCatalog(client: PrismaClient): Promise<SeededCatalog> {
  const province = await client.province.create({ data: { name: 'Ciudad de Buenos Aires' } })

  const locality = await client.locality.create({
    data: { provinceId: province.id, name: 'Caballito', postalCode: '1405' },
  })

  const provider = await client.insuranceProvider.create({ data: { name: 'Swiss Medical' } })
  const company = await client.contractingCompany.create({ data: { name: 'SanityCare' } })

  await client.companyInsuranceProvider.create({
    data: { contractingCompanyId: company.id, insuranceProviderId: provider.id },
  })

  const specialty = await client.specialty.create({
    data: { name: 'Kinesiologia Motora', serviceUnit: 'SESION' },
  })

  const frequency = await client.frequency.create({ data: { amount: 2, unit: 'SEMANAL' } })

  await client.specialtyFrequency.create({
    data: { specialtyId: specialty.id, frequencyId: frequency.id },
  })

  const professional = await client.professional.create({
    data: { lastName: 'Gomez', firstName: 'Yolanda' },
  })

  await client.professionalSpecialty.create({
    data: { professionalId: professional.id, specialtyId: specialty.id },
  })

  return {
    provinceId: province.id,
    localityId: locality.id,
    insuranceProviderId: provider.id,
    contractingCompanyId: company.id,
    specialtyId: specialty.id,
    frequencyId: frequency.id,
    professionalId: professional.id,
  }
}
