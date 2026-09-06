import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { Role } from '../../src/generated/prisma/enums.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { DeactivateUserUseCase } from '../../src/application/useCases/user/deactivateUserUseCase.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { JwtTokenService } from '../../src/infrastructure/security/jwtTokenService.js'
import { createApp } from '../../src/interfaces/http/app.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

/**
 * Administración de catálogos y usuarios, contra Postgres.
 *
 * Lo que más importa acá no es que los endpoints existan: es que el borde de
 * permisos aguante y que NADA se borre.
 */

const PASSWORD = 'una-contraseña-larga-de-prueba'

let client: PrismaClient
let concurrentClient: PrismaClient
let app: Express
let catalog: SeededCatalog

const hasher = new Argon2PasswordHasher()

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

  app = createApp({
    infrastructure: createInfrastructure(client),
    tokenService: new JwtTokenService('a'.repeat(48), 'b'.repeat(48)),
    passwordHasher: hasher,
    allowedOrigins: ['http://localhost:3000'],
    cookieSecure: false,
    trustProxyHops: 0,
  })
})

async function signedIn(role: Role, email = `${role.toLowerCase()}@idutils.local`): Promise<request.Agent> {
  await client.user.create({
    data: { email, passwordHash: await hasher.hash(PASSWORD), name: 'Prueba', role },
  })

  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(response.status).toBe(200)

  return agent
}

describe('el borde de permisos', () => {
  it('OPERADOR y LECTOR no entran a /api/admin', async () => {
    const operador = await signedIn(Role.OPERADOR)
    const lector = await signedIn(Role.LECTOR)

    expect((await operador.get('/api/admin/users')).status).toBe(403)
    expect((await operador.post('/api/admin/specialties').send({})).status).toBe(403)
    expect((await lector.get('/api/admin/specialties')).status).toBe(403)
  })

  it('sin sesión tampoco', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401)
  })
})

describe('catálogos', () => {
  it('crea una especialidad y la desactiva sin borrarla', async () => {
    const admin = await signedIn(Role.ADMIN)

    const created = await admin
      .post('/api/admin/specialties')
      .send({ name: 'Fonoaudiología', serviceUnit: 'SESION' })

    expect(created.status).toBe(201)
    const id = created.body.data.id

    expect((await admin.post(`/api/admin/specialties/${id}/deactivate`)).status).toBe(204)

    // Sale del selector...
    const listed = await admin.get('/api/admin/specialties')
    expect(listed.body.data.map((item: { id: string }) => item.id)).not.toContain(id)

    // ...pero la fila sigue existiendo. Hay prestaciones que la referencian:
    // borrarla sería borrar la historia con la que se defiende una auditoría.
    const row = await client.specialty.findUnique({ where: { id } })
    expect(row).not.toBeNull()
    expect(row?.active).toBe(false)

    // Y desactivar dos veces es un error, no un silencio.
    expect((await admin.post(`/api/admin/specialties/${id}/deactivate`)).status).toBe(409)
  })

  it('reemplaza el conjunto de frecuencias de una especialidad, no lo agrega', async () => {
    const admin = await signedIn(Role.ADMIN)

    const otra = await admin.post('/api/admin/frequencies').send({ amount: 5, unit: 'SEMANAL' })
    expect(otra.status).toBe(201)

    // El seed dejó la especialidad con una sola frecuencia habilitada.
    const antes = await admin
      .get('/api/catalogs/frequencies')
      .query({ specialtyId: catalog.specialtyId })
    expect(antes.body.data).toHaveLength(1)

    // Se manda el conjunto COMPLETO: la vieja no está, así que se va.
    const puesto = await admin
      .put(`/api/admin/specialties/${catalog.specialtyId}/frequencies`)
      .send({ frequencyIds: [otra.body.data.id] })

    expect(puesto.status).toBe(200)
    expect(puesto.body.data).toHaveLength(1)
    expect(puesto.body.data[0].amount).toBe(5)

    const despues = await admin
      .get('/api/catalogs/frequencies')
      .query({ specialtyId: catalog.specialtyId })
    expect(despues.body.data.map((f: { amount: number }) => f.amount)).toEqual([5])
  })

  it('vuelve a enganchar una frecuencia desvinculada antes', async () => {
    // El @@unique de la tabla de unión es total: una fila con deletedAt
    // bloquearía el alta siguiente si el repositorio no la reviviera.
    const admin = await signedIn(Role.ADMIN)
    const url = `/api/admin/specialties/${catalog.specialtyId}/frequencies`

    await admin.put(url).send({ frequencyIds: [] })
    const vuelta = await admin.put(url).send({ frequencyIds: [catalog.frequencyId] })

    expect(vuelta.status).toBe(200)
    expect(vuelta.body.data).toHaveLength(1)
  })

  it('rechaza enganchar una frecuencia que no existe, y no deja nada a medias', async () => {
    const admin = await signedIn(Role.ADMIN)

    const response = await admin
      .put(`/api/admin/specialties/${catalog.specialtyId}/frequencies`)
      .send({ frequencyIds: ['3f1b6d1e-0000-4000-8000-000000000000'] })

    expect(response.status).toBe(404)

    // La validación corre ANTES de escribir: el vínculo original sigue.
    const sigue = await admin
      .get('/api/catalogs/frequencies')
      .query({ specialtyId: catalog.specialtyId })
    expect(sigue.body.data).toHaveLength(1)
  })

  it('el ADMIN ve TODAS las obras sociales; el operador sólo las alcanzables (D2)', async () => {
    const admin = await signedIn(Role.ADMIN)

    const sinConvenio = await admin
      .post('/api/admin/insurance-providers')
      .send({ name: 'Obra social sin convenio' })
    expect(sinConvenio.status).toBe(201)

    // El ADMIN necesita verla: si no, no podría cargarle el convenio que falta.
    const todas = await admin.get('/api/admin/insurance-providers')
    expect(todas.body.data).toHaveLength(2)

    // El operador no: cargar un paciente ahí sería cargarlo para no facturarle
    // a nadie.
    const alcanzables = await admin.get('/api/catalogs/insurance-providers')
    expect(alcanzables.body.data).toHaveLength(1)
  })

  it('carga el convenio de una empresa y eso hace alcanzable a la obra social', async () => {
    const admin = await signedIn(Role.ADMIN)

    const provider = await admin
      .post('/api/admin/insurance-providers')
      .send({ name: 'Obra Social Nueva' })

    const company = await admin
      .post('/api/admin/contracting-companies')
      .send({ name: 'Empresa Nueva' })

    expect((await admin.get('/api/catalogs/insurance-providers')).body.data).toHaveLength(1)

    const convenio = await admin
      .put(`/api/admin/contracting-companies/${company.body.data.id}/insurance-providers`)
      .send({ insuranceProviderIds: [provider.body.data.id] })

    expect(convenio.status).toBe(200)
    expect(convenio.body.data).toEqual([provider.body.data.id])

    expect((await admin.get('/api/catalogs/insurance-providers')).body.data).toHaveLength(2)
  })

  it('cambia las especialidades de un profesional reemplazando el conjunto', async () => {
    const admin = await signedIn(Role.ADMIN)

    const nueva = await admin
      .post('/api/admin/specialties')
      .send({ name: 'Enfermería', serviceUnit: 'VISITA' })

    const puesto = await admin
      .put(`/api/admin/professionals/${catalog.professionalId}/specialties`)
      .send({ specialtyIds: [nueva.body.data.id] })

    expect(puesto.status).toBe(200)
    expect(puesto.body.data).toEqual([nueva.body.data.id])

    // Ya no aparece en el selector de la especialidad vieja.
    const viejos = await admin
      .get('/api/catalogs/professionals')
      .query({ specialtyId: catalog.specialtyId })
    expect(viejos.body.data).toHaveLength(0)
  })
})

describe('usuarios', () => {
  it('crea un usuario que puede iniciar sesión, y no devuelve el hash', async () => {
    const admin = await signedIn(Role.ADMIN)

    const created = await admin.post('/api/admin/users').send({
      email: 'Ana@IDUtils.local',
      password: 'contraseña-de-doce-o-mas',
      name: 'Ana',
      role: 'OPERADOR',
    })

    expect(created.status).toBe(201)
    // El correo se normaliza en el alta con la misma función que el login.
    expect(created.body.data.email).toBe('ana@idutils.local')
    expect(JSON.stringify(created.body)).not.toContain('passwordHash')

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@idutils.local', password: 'contraseña-de-doce-o-mas' })

    expect(login.status).toBe(200)
    expect(login.body.data.role).toBe('OPERADOR')
  })

  it('rechaza un correo repetido con el mensaje correcto', async () => {
    const admin = await signedIn(Role.ADMIN)
    const body = {
      email: 'ana@idutils.local',
      password: 'contraseña-de-doce-o-mas',
      name: 'Ana',
      role: 'LECTOR',
    }

    expect((await admin.post('/api/admin/users').send(body)).status).toBe(201)

    const repetido = await admin.post('/api/admin/users').send(body)
    expect(repetido.status).toBe(409)
    expect(repetido.body.message).toContain('correo')
  })

  it('exige contraseñas de al menos doce caracteres al CREAR', async () => {
    const admin = await signedIn(Role.ADMIN)

    const corta = await admin.post('/api/admin/users').send({
      email: 'corta@idutils.local',
      password: 'corta',
      name: 'Corta',
      role: 'LECTOR',
    })

    expect(corta.status).toBe(400)
    expect(corta.body.details.join(' ')).toContain('12')
  })

  it('cambiar la contraseña corta la sesión: el refresh deja de servir', async () => {
    const admin = await signedIn(Role.ADMIN)
    const operador = await signedIn(Role.OPERADOR)

    const users = await admin.get('/api/admin/users')
    const target = users.body.data.find(
      (user: { role: string }) => user.role === 'OPERADOR',
    )

    const changed = await admin
      .post(`/api/admin/users/${target.id}/password`)
      .send({ password: 'otra-contraseña-larga' })
    expect(changed.status).toBe(204)

    // `tokenVersion` subió: el refresh del operador ya no coincide y muere.
    expect((await operador.post('/api/auth/refresh')).status).toBe(401)
  })

  it('no deja darse de baja a uno mismo', async () => {
    const admin = await signedIn(Role.ADMIN)
    const me = await admin.get('/api/auth/me')

    const response = await admin.post(`/api/admin/users/${me.body.data.id}/deactivate`)

    expect(response.status).toBe(409)
    expect(response.body.message).toContain('vos mismo')
  })

  it('da de baja a un operador y le corta el refresh', async () => {
    const admin = await signedIn(Role.ADMIN)
    const operador = await signedIn(Role.OPERADOR)

    const users = await admin.get('/api/admin/users')
    const target = users.body.data.find((user: { role: string }) => user.role === 'OPERADOR')

    expect((await admin.post(`/api/admin/users/${target.id}/deactivate`)).status).toBe(204)

    expect((await operador.post('/api/auth/refresh')).status).toBe(403)
    expect((await admin.get('/api/admin/users')).body.data).toHaveLength(1)
  })

  it('serializa dos bajas concurrentes y conserva un ADMIN activo', async () => {
    const inactiveRequester = await client.user.create({
      data: {
        email: 'requester@idutils.local',
        passwordHash: 'hash',
        name: 'Requester',
        role: Role.ADMIN,
        active: false,
      },
    })
    const [adminA, adminB] = await Promise.all([
      client.user.create({
        data: { email: 'admin-a@idutils.local', passwordHash: 'hash', name: 'Admin A', role: Role.ADMIN },
      }),
      client.user.create({
        data: { email: 'admin-b@idutils.local', passwordHash: 'hash', name: 'Admin B', role: Role.ADMIN },
      }),
    ])
    const useCaseA = new DeactivateUserUseCase(createInfrastructure(client).users)
    const useCaseB = new DeactivateUserUseCase(createInfrastructure(concurrentClient).users)

    async function deactivate(useCase: DeactivateUserUseCase, userId: string): Promise<string> {
      try {
        await useCase.execute(userId, inactiveRequester.id)
        return 'deactivated'
      } catch (error) {
        if (error instanceof Error) return error.message
        throw error
      }
    }

    const outcomes = await Promise.all([
      deactivate(useCaseA, adminA.id),
      deactivate(useCaseB, adminB.id),
    ])

    expect(outcomes.sort()).toEqual(
      [ERROR_MESSAGES.USER.LAST_ADMIN, 'deactivated'].sort(),
    )
    expect(
      await client.user.count({
        where: { role: Role.ADMIN, active: true, deletedAt: null },
      }),
    ).toBe(1)
  })
})
