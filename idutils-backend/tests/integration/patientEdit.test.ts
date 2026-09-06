import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { Role } from '../../src/generated/prisma/enums.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { JwtTokenService } from '../../src/infrastructure/security/jwtTokenService.js'
import { createApp } from '../../src/interfaces/http/app.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

/**
 * Corrección y baja de paciente.
 *
 * El test que más importa acá es el del número de afiliado que vuelve a estar
 * disponible. Es el que prueba que la baja no deja un fantasma ocupando el par
 * (obra social, N° de afiliado) del índice único parcial.
 */

const PASSWORD = 'una-contraseña-larga-de-prueba'

let client: PrismaClient
let app: Express
let catalog: SeededCatalog

const hasher = new Argon2PasswordHasher()

beforeAll(async () => {
  client = await createTestClient()
})

afterAll(async () => {
  await client.$disconnect()
})

beforeEach(async () => {
  await resetDatabase(client)
  catalog = await seedCatalog(client)

  app = createApp({
    infrastructure: createInfrastructure(client),
    tokenService: new JwtTokenService('a'.repeat(48), 'b'.repeat(48)),
    passwordHasher: hasher,
    allowedOrigins: ['http://localhost:3000'],
    cookieSecure: false,
    trustProxyHops: 0,
  })
})

async function signedIn(role: Role): Promise<request.Agent> {
  const email = `${role.toLowerCase()}@idutils.local`
  await client.user.create({
    data: { email, passwordHash: await hasher.hash(PASSWORD), name: 'Prueba', role },
  })

  const agent = request.agent(app)
  expect((await agent.post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200)

  return agent
}

async function createPatient(
  agent: request.Agent,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; affiliationId: string }> {
  const created = await agent.post('/api/patients').send({
    lastName: 'Perez',
    firstName: 'Juan',
    addressStreet: 'Rivadavia 4321',
    localityId: catalog.localityId,
    affiliation: {
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: '00123-456',
      from: '2026-01-01',
    },
    ...overrides,
  })

  expect(created.status).toBe(201)

  const detail = await agent.get(`/api/patients/${created.body.data.id}`)
  return {
    id: created.body.data.id,
    affiliationId: detail.body.data.affiliations[0].id,
  }
}

describe('corrección de datos', () => {
  it('corrige lo que se escribió mal y deja el resto como estaba', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(agent)

    const updated = await agent.patch(`/api/patients/${id}`).send({
      lastName: 'Pérez',
      addressDetail: '3 B',
      notes: 'El timbre no anda, golpear',
    })

    expect(updated.status).toBe(200)
    expect(updated.body.data).toMatchObject({
      lastName: 'Pérez',
      // No se mandó y no se tocó: por eso es PATCH y no PUT.
      firstName: 'Juan',
      addressStreet: 'Rivadavia 4321',
      addressDetail: '3 B',
      notes: 'El timbre no anda, golpear',
    })
  })

  it('rechaza un cuerpo vacío en vez de hacer una escritura que no cambia nada', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(agent)

    const response = await agent.patch(`/api/patients/${id}`).send({})

    expect(response.status).toBe(400)
    expect(response.body.details.join(' ')).toContain('nada que cambiar')
  })

  it('rechaza una localidad que no existe, nombrando el campo', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(agent)

    const response = await agent
      .patch(`/api/patients/${id}`)
      .send({ localityId: '3f1b6d1e-0000-4000-8000-000000000000' })

    expect(response.status).toBe(404)
    expect(response.body.message).toContain('localidad')
  })

  it('un LECTOR no corrige nada', async () => {
    const operador = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(operador)

    const lector = await signedIn(Role.LECTOR)

    expect((await lector.patch(`/api/patients/${id}`).send({ lastName: 'X' })).status).toBe(403)
  })
})

describe('baja de un paciente cargado por error', () => {
  it('lo saca del listado y LIBERA el número de afiliado', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(agent)

    expect((await agent.get('/api/patients')).body.meta.total).toBe(1)

    expect((await agent.post(`/api/patients/${id}/deactivate`)).status).toBe(204)
    expect((await agent.get('/api/patients')).body.meta.total).toBe(0)
    expect((await agent.get(`/api/patients/${id}`)).status).toBe(404)

    // ESTO es lo que importa. Si la afiliación quedara viva, seguiría ocupando
    // el par (obra social, N° de afiliado) y el paciente de verdad no se podría
    // cargar nunca: el error diría "ya hay un paciente con ese número" apuntando
    // a alguien que no está en ninguna lista.
    const lookup = await agent
      .get('/api/affiliations/lookup')
      .query({ insuranceProviderId: catalog.insuranceProviderId, memberNumber: '123456' })
    expect(lookup.body.data.found).toBe(false)

    const otraVez = await agent.post('/api/patients').send({
      lastName: 'Perez',
      firstName: 'Juan Carlos',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '00123-456',
        from: '2026-01-01',
      },
    })

    expect(otraVez.status).toBe(201)
  })

  it('NO deja dar de baja a un paciente con episodios, y dice qué hacer', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id, affiliationId } = await createPatient(agent)

    const episode = await agent.post('/api/episodes').send({
      patientId: id,
      affiliationId,
      startsOn: '2026-02-01',
      careServices: [],
    })
    expect(episode.status).toBe(201)

    const response = await agent.post(`/api/patients/${id}/deactivate`)

    // Tuvo internación domiciliaria: esa historia es con la que se defiende una
    // auditoría. Lo que corresponde es cerrar el episodio, no borrar la persona.
    expect(response.status).toBe(409)
    expect(response.body.message).toContain('cerrá el episodio')

    // Y el paciente sigue entero: la transacción no dejó nada a medias.
    expect((await agent.get(`/api/patients/${id}`)).status).toBe(200)
    const affiliation = await client.affiliation.findUniqueOrThrow({
      where: { id: affiliationId },
    })
    expect(affiliation.deletedAt).toBeNull()
  })

  it('no se puede dar de baja dos veces', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(agent)

    expect((await agent.post(`/api/patients/${id}/deactivate`)).status).toBe(204)
    expect((await agent.post(`/api/patients/${id}/deactivate`)).status).toBe(404)
  })

  it('un LECTOR no da de baja a nadie', async () => {
    const operador = await signedIn(Role.OPERADOR)
    const { id } = await createPatient(operador)

    const lector = await signedIn(Role.LECTOR)

    expect((await lector.post(`/api/patients/${id}/deactivate`)).status).toBe(403)
  })
})
