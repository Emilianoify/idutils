import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { seedAdminUser } from '../../prisma/seed/adminUser.js'
import {
  seedDemoData,
  seedInstallationCatalog,
} from '../../prisma/seed/installationCatalog.js'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { createTestClient, resetDatabase } from './helpers/database.js'

/**
 * El seed es un script que alguien va a correr dos veces.
 *
 * No por descuido: lo va a correr despues de una migracion, o porque no se
 * acuerda si ya lo corrio. Estos tests son el contrato de que eso no rompe
 * nada, y sobre todo de que NO resucita lo que la coordinacion dio de baja.
 * Es la clase de bug que no explota: simplemente reaparece una frecuencia en un
 * selector y nadie sabe por que.
 */

let client: PrismaClient
const hasher = new Argon2PasswordHasher()

beforeAll(async () => {
  client = await createTestClient()
})

afterAll(async () => {
  await client.$disconnect()
})

beforeEach(async () => {
  await resetDatabase(client)
})

describe('catálogo de instalación', () => {
  it('siembra frecuencias, especialidades con su filtro y las 24 provincias', async () => {
    const report = await seedInstallationCatalog(client)

    expect(report.frequencies).toBe(11)
    expect(report.specialties).toBe(9)
    expect(report.provinces).toBe(24)
    expect(report.skipped).toEqual([])

    // El filtro de D11 existe de verdad: cada especialidad ofrece un
    // SUBCONJUNTO, no las once frecuencias.
    const specialty = await client.specialty.findFirstOrThrow({
      where: { name: 'Psicología' },
    })

    const eligible = await createInfrastructure(client).frequencies.listEligibleForSpecialty(
      specialty.id,
    )

    expect(eligible).toHaveLength(2)
    expect(eligible.length).toBeLessThan(report.frequencies)
  })

  it('correrlo dos veces no duplica nada', async () => {
    await seedInstallationCatalog(client)
    const second = await seedInstallationCatalog(client)

    expect(second.frequencies).toBe(0)
    expect(second.specialties).toBe(0)
    expect(second.provinces).toBe(0)
    expect(second.skipped).toEqual(['frecuencias', 'especialidades', 'provincias'])

    expect(await client.frequency.count()).toBe(11)
    expect(await client.specialty.count()).toBe(9)
    expect(await client.province.count()).toBe(24)
  })

  it('NO resucita una frecuencia que la coordinación dio de baja', async () => {
    await seedInstallationCatalog(client)

    const frequency = await client.frequency.findFirstOrThrow({
      where: { amount: 7, unit: 'SEMANAL' },
    })
    await client.frequency.update({
      where: { id: frequency.id },
      data: { active: false },
    })

    await seedInstallationCatalog(client)

    // Sigue dada de baja. Un seed que la reactivara la haria reaparecer en el
    // selector sin que nadie la haya vuelto a pedir.
    const after = await client.frequency.findUniqueOrThrow({ where: { id: frequency.id } })
    expect(after.active).toBe(false)
  })

  it('NO recrea una frecuencia borrada lógicamente', async () => {
    await seedInstallationCatalog(client)

    const frequency = await client.frequency.findFirstOrThrow({
      where: { amount: 6, unit: 'SEMANAL' },
    })
    await client.frequency.update({
      where: { id: frequency.id },
      data: { deletedAt: new Date() },
    })

    await seedInstallationCatalog(client)

    // Once en total, no doce: una fila ausente del catálogo activo no es
    // "falta", es una decisión de la coordinación.
    expect(await client.frequency.count()).toBe(11)
  })
})

describe('usuario administrador', () => {
  const credentials = {
    email: 'admin@idutils.local',
    password: 'contraseña-de-instalación',
    name: 'Administración',
  }

  it('lo crea con rol ADMIN y guarda la contraseña hasheada', async () => {
    const result = await seedAdminUser(client, credentials)

    expect(result.created).toBe(true)

    const user = await client.user.findUniqueOrThrow({ where: { email: credentials.email } })
    expect(user.role).toBe('ADMIN')
    expect(user.active).toBe(true)

    // Nunca en texto plano. Ni en la base, ni en ningún lado.
    expect(user.passwordHash).not.toContain(credentials.password)
    expect(await hasher.verify(user.passwordHash, credentials.password)).toBe(true)
  })

  it('normaliza el correo, así el login lo encuentra escrito de cualquier forma', async () => {
    await seedAdminUser(client, { ...credentials, email: '  ADMIN@IDUtils.Local ' })

    const user = await client.user.findUnique({ where: { email: 'admin@idutils.local' } })
    expect(user).not.toBeNull()
  })

  it('NO pisa la contraseña si el usuario ya existe', async () => {
    await seedAdminUser(client, credentials)

    // Alguien la cambió después de instalar, como corresponde.
    const changed = 'la-que-eligió-la-coordinación'
    await client.user.update({
      where: { email: credentials.email },
      data: { passwordHash: await hasher.hash(changed), tokenVersion: { increment: 1 } },
    })

    const second = await seedAdminUser(client, credentials)
    expect(second.created).toBe(false)

    const user = await client.user.findUniqueOrThrow({ where: { email: credentials.email } })

    // Si el seed pisara el hash, cada `pnpm db:seed` sería un reseteo silencioso
    // de la credencial del administrador a la del .env de instalación.
    expect(await hasher.verify(user.passwordHash, changed)).toBe(true)
    expect(await hasher.verify(user.passwordHash, credentials.password)).toBe(false)
    expect(user.tokenVersion).toBe(1)
  })
})

describe('datos de ejemplo', () => {
  it('dejan una obra social ALCANZABLE, con convenio de por medio (D2)', async () => {
    await seedInstallationCatalog(client)
    const demo = await seedDemoData(client)

    expect(demo.created).toBe(true)

    // Sin la fila de convenio, el selector de obras sociales volvería vacío y
    // los datos de ejemplo no servirían para nada.
    const reachable = await createInfrastructure(client).insuranceProviders.listReachable()
    expect(reachable).toHaveLength(1)
    expect(reachable[0]?.name).toBe('Obra Social de Ejemplo')
  })

  it('no se cargan dos veces', async () => {
    await seedInstallationCatalog(client)
    await seedDemoData(client)

    const second = await seedDemoData(client)

    expect(second.created).toBe(false)
    expect(await client.insuranceProvider.count()).toBe(1)
  })
})
