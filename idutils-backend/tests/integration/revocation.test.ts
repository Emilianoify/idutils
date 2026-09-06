import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { Role } from '../../src/generated/prisma/enums.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { JwtTokenService } from '../../src/infrastructure/security/jwtTokenService.js'
import { createApp } from '../../src/interfaces/http/app.js'
import { createTestClient, resetDatabase } from './helpers/database.js'

/**
 * Revocación: que "dar de baja" signifique AHORA.
 *
 * Estos tests existen por una decisión concreta: `authenticate` lee el usuario
 * en cada pedido en vez de confiar solo en la firma del token. Sin eso, el
 * access token de alguien que ya no trabaja acá sigue sirviendo hasta que
 * venza —hasta quince minutos— y el sistema no tiene forma de frenarlo.
 *
 * Son los tests que hay que mirar el día que a alguien se le ocurra sacar esa
 * consulta "porque pega a la base en cada request". El costo es una lectura por
 * clave primaria; lo que se compra está acá abajo.
 */

const PASSWORD = 'una-contraseña-larga-de-prueba'

let client: PrismaClient
let app: Express

const hasher = new Argon2PasswordHasher()

beforeAll(async () => {
  client = await createTestClient()
})

afterAll(async () => {
  await client.$disconnect()
})

beforeEach(async () => {
  await resetDatabase(client)

  app = createApp({
    infrastructure: createInfrastructure(client),
    tokenService: new JwtTokenService('a'.repeat(48), 'b'.repeat(48)),
    passwordHasher: hasher,
    allowedOrigins: ['http://localhost:3000'],
    cookieSecure: false,
    trustProxyHops: 0,
  })
})

async function signedIn(role: Role, email: string): Promise<request.Agent> {
  await client.user.create({
    data: { email, passwordHash: await hasher.hash(PASSWORD), name: 'Prueba', role },
  })

  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD })
  expect(response.status).toBe(200)

  return agent
}

async function userIdOf(email: string): Promise<string> {
  const user = await client.user.findUniqueOrThrow({ where: { email } })
  return user.id
}

function refreshCookieOf(response: request.Response): string {
  const headers = response.headers['set-cookie']
  if (!Array.isArray(headers)) throw new Error('La respuesta no incluyó cookies')

  const cookie = headers.find((header) => header.startsWith('refresh_token='))
  const pair = cookie?.split(';')[0]
  if (pair === undefined) throw new Error('La respuesta no incluyó refresh token')
  return pair
}

async function loginCookie(email: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
  expect(response.status).toBe(200)
  return refreshCookieOf(response)
}

describe('la baja surte efecto en el próximo pedido, no cuando vence el token', () => {
  it('el access token de un usuario dado de baja deja de servir en el acto', async () => {
    const admin = await signedIn(Role.ADMIN, 'admin@idutils.local')
    const operador = await signedIn(Role.OPERADOR, 'operador@idutils.local')

    // La sesión anda antes de la baja.
    expect((await operador.get('/api/auth/me')).status).toBe(200)

    const target = await userIdOf('operador@idutils.local')
    expect((await admin.post(`/api/admin/users/${target}/deactivate`)).status).toBe(204)

    // Y deja de andar YA, con el mismo token que hace un segundo servía.
    const after = await operador.get('/api/auth/me')
    expect(after.status).toBe(403)
    expect(after.body.message).toContain('baja')

    // También queda afuera de todo lo demás, no solo de /me.
    expect((await operador.get('/api/dashboard')).status).toBe(403)
    expect((await operador.post('/api/auth/refresh')).status).toBe(403)
  })

  it('cambiar la contraseña mata las sesiones abiertas en el acto', async () => {
    const admin = await signedIn(Role.ADMIN, 'admin@idutils.local')
    const operador = await signedIn(Role.OPERADOR, 'operador@idutils.local')

    expect((await operador.get('/api/auth/me')).status).toBe(200)

    const target = await userIdOf('operador@idutils.local')
    const changed = await admin
      .post(`/api/admin/users/${target}/password`)
      .send({ password: 'otra-contraseña-larga' })
    expect(changed.status).toBe(204)

    // `tokenVersion` subió: el token que tiene el navegador nació antes.
    expect((await operador.get('/api/auth/me')).status).toBe(401)
    expect((await operador.post('/api/auth/refresh')).status).toBe(401)

    // Y el admin, que no cambió nada suyo, sigue trabajando.
    expect((await admin.get('/api/auth/me')).status).toBe(200)
  })

  it('un cambio de rol se aplica en el acto, sin esperar a que venza nada', async () => {
    // El rol sale de la base y no del token. Un ADMIN degradado a LECTOR que
    // conservara sus permisos quince minutos podría, en esos quince minutos,
    // volver a darse permisos.
    const usuario = await signedIn(Role.ADMIN, 'jefe@idutils.local')

    expect((await usuario.get('/api/admin/users')).status).toBe(200)

    await client.user.update({
      where: { email: 'jefe@idutils.local' },
      data: { role: Role.LECTOR },
    })

    // Mismo token, permisos nuevos.
    expect((await usuario.get('/api/admin/users')).status).toBe(403)
    // Y lo que sí puede un LECTOR, lo sigue pudiendo.
    expect((await usuario.get('/api/dashboard')).status).toBe(200)
  })

  it('cerrar sesión NO afecta a los otros dispositivos del mismo usuario', async () => {
    // Es la contracara de la decisión de no rotar `tokenVersion`: varias
    // sesiones por persona. La compu y el celular son sesiones distintas.
    const compu = await signedIn(Role.OPERADOR, 'ana@idutils.local')

    const celular = request.agent(app)
    expect(
      (await celular.post('/api/auth/login').send({
        email: 'ana@idutils.local',
        password: PASSWORD,
      })).status,
    ).toBe(200)

    await compu.post('/api/auth/logout')

    expect((await compu.get('/api/auth/me')).status).toBe(401)
    expect((await celular.get('/api/auth/me')).status).toBe(200)
  })
})

describe('rotación y revocación por dispositivo', () => {
  it('rota, detecta el predecesor y preserva otro dispositivo', async () => {
    await client.user.create({
      data: {
        email: 'ana@idutils.local',
        passwordHash: await hasher.hash(PASSWORD),
        name: 'Ana',
        role: Role.OPERADOR,
      },
    })

    const computer = await loginCookie('ana@idutils.local')
    const phone = await loginCookie('ana@idutils.local')

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', computer)
    expect(rotated.status).toBe(200)
    const computerSuccessor = refreshCookieOf(rotated)

    expect((await request(app).post('/api/auth/refresh').set('Cookie', computer)).status).toBe(401)
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', computerSuccessor)).status,
    ).toBe(401)
    expect((await request(app).post('/api/auth/refresh').set('Cookie', phone)).status).toBe(200)
  })

  it('permite un solo ganador si dos refresh consumen el mismo token', async () => {
    await client.user.create({
      data: {
        email: 'ana@idutils.local',
        passwordHash: await hasher.hash(PASSWORD),
        name: 'Ana',
        role: Role.OPERADOR,
      },
    })
    const predecessor = await loginCookie('ana@idutils.local')

    const attempts = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', predecessor),
      request(app).post('/api/auth/refresh').set('Cookie', predecessor),
    ])

    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 401])
    const winner = attempts.find((attempt) => attempt.status === 200)
    if (winner === undefined) throw new Error('No hubo un ganador de la rotación')

    const successor = refreshCookieOf(winner)
    expect((await request(app).post('/api/auth/refresh').set('Cookie', successor)).status).toBe(
      401,
    )
  })

  it('logout revoca solo la sesión actual y siempre limpia las cookies', async () => {
    await client.user.create({
      data: {
        email: 'ana@idutils.local',
        passwordHash: await hasher.hash(PASSWORD),
        name: 'Ana',
        role: Role.OPERADOR,
      },
    })
    const computer = await loginCookie('ana@idutils.local')
    const phone = await loginCookie('ana@idutils.local')

    const logout = await request(app).post('/api/auth/logout').set('Cookie', computer)
    expect(logout.status).toBe(200)
    expect(logout.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('access_token=;'),
        expect.stringContaining('refresh_token=;'),
      ]),
    )

    expect((await request(app).post('/api/auth/refresh').set('Cookie', computer)).status).toBe(401)
    expect((await request(app).post('/api/auth/refresh').set('Cookie', phone)).status).toBe(200)
    expect((await request(app).post('/api/auth/logout').set('Cookie', computer)).status).toBe(200)

    const invalid = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'refresh_token=invalid')
    const missing = await request(app).post('/api/auth/logout')
    expect(invalid.status).toBe(200)
    expect(missing.status).toBe(200)
    expect(missing.headers['set-cookie']).toHaveLength(2)
  })
})
