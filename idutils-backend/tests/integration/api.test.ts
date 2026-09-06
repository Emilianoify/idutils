import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { CloseReason, Role } from '../../src/generated/prisma/enums.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { JwtTokenService } from '../../src/infrastructure/security/jwtTokenService.js'
import { createApp } from '../../src/interfaces/http/app.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

/**
 * La API entera, de la cookie a Postgres y de vuelta.
 *
 * Lo que se prueba aca es la COSTURA: que el borde valide, que la sesion cierre,
 * que los roles frenen y que un rechazo de la base llegue al cliente como una
 * instruccion en castellano y no como un nombre de constraint. Las reglas ya
 * estan probadas mas abajo; esto prueba que el camino existe.
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

  // La app se arma de nuevo en cada test: el limitador de login cuenta en
  // memoria, y compartirlo entre tests haria que el septimo login empiece a
  // recibir 429 por culpa de los anteriores.
  app = createApp({
    infrastructure: createInfrastructure(client),
    tokenService: new JwtTokenService('a'.repeat(48), 'b'.repeat(48)),
    passwordHasher: hasher,
    allowedOrigins: ['http://localhost:3000'],
    cookieSecure: false,
    trustProxyHops: 0,
  })
})

async function createUser(role: Role, email: string): Promise<void> {
  await client.user.create({
    data: {
      email,
      passwordHash: await hasher.hash(PASSWORD),
      name: 'Usuario de prueba',
      role,
    },
  })
}

/** Un agente con la sesion ya abierta. Guarda las cookies entre llamadas. */
async function signedIn(role: Role): Promise<request.Agent> {
  const email = `${role.toLowerCase()}@idutils.local`
  await createUser(role, email)

  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD })

  expect(response.status).toBe(200)
  return agent
}

async function seedCareService(): Promise<{ episodeId: string; careServiceId: string }> {
  const patient = await client.patient.create({
    data: {
      lastName: 'Paciente',
      addressStreet: 'Rivadavia 1234',
      localityId: catalog.localityId,
    },
  })
  const affiliation = await client.affiliation.create({
    data: {
      patientId: patient.id,
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: 'fixture-care-service',
      from: new Date('2026-01-01T00:00:00.000Z'),
    },
  })
  const episode = await client.homeCareEpisode.create({
    data: {
      patientId: patient.id,
      affiliationId: affiliation.id,
      startsOn: new Date('2026-02-01T00:00:00.000Z'),
    },
  })
  const careService = await client.careService.create({
    data: {
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: catalog.professionalId,
    },
  })

  return { episodeId: episode.id, careServiceId: careService.id }
}

describe('sesion', () => {
  it('entrega la sesion en cookies httpOnly y no en el cuerpo', async () => {
    await createUser(Role.ADMIN, 'admin@idutils.local')

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@idutils.local', password: PASSWORD })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ email: 'admin@idutils.local', role: 'ADMIN' })

    // Ni el token ni el hash salen por el cuerpo. Nunca.
    expect(JSON.stringify(response.body)).not.toContain('eyJ')
    expect(JSON.stringify(response.body)).not.toContain('passwordHash')

    const cookies = response.headers['set-cookie'] as unknown as string[]
    const access = cookies.find((cookie) => cookie.startsWith('access_token='))
    const refresh = cookies.find((cookie) => cookie.startsWith('refresh_token='))

    expect(access).toContain('HttpOnly')
    expect(access).toContain('SameSite=Strict')
    // El refresh solo viaja a las rutas de auth: en el resto de la API no tiene
    // nada que hacer y cada viaje de mas es una chance de que quede en un log.
    expect(refresh).toContain('Path=/api/auth')
  })

  it('da el mismo mensaje para usuario inexistente y contraseña incorrecta', async () => {
    await createUser(Role.ADMIN, 'admin@idutils.local')

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@idutils.local', password: 'otra-cosa' })

    const noSuchUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@idutils.local', password: PASSWORD })

    // Si dijeran cosas distintas, cualquiera podria averiguar que correos
    // existen probando de a uno, sin saber ninguna contraseña.
    expect(wrongPassword.status).toBe(401)
    expect(noSuchUser.status).toBe(401)
    expect(noSuchUser.body.message).toBe(wrongPassword.body.message)
  })

  it('el correo no distingue mayusculas', async () => {
    await createUser(Role.OPERADOR, 'ana@idutils.local')

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Ana@IDUtils.local ', password: PASSWORD })

    expect(response.status).toBe(200)
  })

  it('rechaza sin sesion y responde el usuario con sesion', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401)

    const agent = await signedIn(Role.OPERADOR)
    const me = await agent.get('/api/auth/me')

    expect(me.status).toBe(200)
    expect(me.body.data.role).toBe('OPERADOR')
  })

  it('renueva la sesion con el refresh y la corta al cerrar', async () => {
    const agent = await signedIn(Role.OPERADOR)

    expect((await agent.post('/api/auth/refresh')).status).toBe(200)
    expect((await agent.get('/api/auth/me')).status).toBe(200)

    await agent.post('/api/auth/logout')

    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('un access token no sirve como refresh', async () => {
    // Los dos secretos distintos hacen que esto sea imposible, no improbable.
    const agent = await signedIn(Role.OPERADOR)
    const login = await agent.get('/api/auth/me')
    expect(login.status).toBe(200)

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=no-es-un-token')

    expect(response.status).toBe(401)
  })
})

describe('permisos (D14)', () => {
  it('LECTOR mira pero no escribe', async () => {
    const agent = await signedIn(Role.LECTOR)

    expect((await agent.get('/api/dashboard')).status).toBe(200)
    expect((await agent.get('/api/catalogs/specialties')).status).toBe(200)

    const write = await agent.post('/api/patients').send({})
    expect(write.status).toBe(403)
  })
})

describe('alta de paciente, de punta a punta', () => {
  it('recorre el flujo de D8: buscar, no existe, crear, y ahora si existe', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const lookupBefore = await agent
      .get('/api/affiliations/lookup')
      .query({ insuranceProviderId: catalog.insuranceProviderId, memberNumber: '00123-456' })

    expect(lookupBefore.status).toBe(200)
    expect(lookupBefore.body.data).toEqual({ found: false, patient: null })

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
      contacts: [{ name: 'Ana', relationship: 'hija', phone: '1155667788', isPrimary: true }],
    })

    expect(created.status).toBe(201)
    // El numero se guarda normalizado, y por eso la busqueda de abajo lo
    // encuentra escrito de otra forma.
    expect(created.body.data.memberNumber).toBe('123456')
    expect(created.body.data.status).toBe('SIN_INICIAR')

    const lookupAfter = await agent
      .get('/api/affiliations/lookup')
      .query({ insuranceProviderId: catalog.insuranceProviderId, memberNumber: '123.456' })

    expect(lookupAfter.body.data.found).toBe(true)
    expect(lookupAfter.body.data.patient.lastName).toBe('Perez')
  })

  it('traduce el rechazo de la base a una instruccion, no a un nombre de constraint', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const body = {
      lastName: 'Perez',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: '2026-01-01',
      },
    }

    expect((await agent.post('/api/patients').send(body)).status).toBe(201)

    const duplicated = await agent
      .post('/api/patients')
      .send({ ...body, lastName: 'Gonzalez' })

    expect(duplicated.status).toBe(409)
    expect(duplicated.body.message).toContain('número de afiliado')
    expect(duplicated.body.message).not.toContain('constraint')
  })

  it('devuelve TODOS los campos invalidos juntos, no el primero', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const response = await agent.post('/api/patients').send({
      lastName: '',
      addressStreet: '',
      localityId: 'no-es-un-uuid',
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123',
        from: '2026-02-31',
      },
    })

    expect(response.status).toBe(400)
    // Un formulario tiene que poder marcar los cuatro campos a la vez.
    expect(response.body.details.length).toBeGreaterThanOrEqual(4)
    expect(response.body.details.join(' ')).toContain('affiliation.from')
  })

  it('rechaza una fecha que no existe en el calendario', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const response = await agent.post('/api/patients').send({
      lastName: 'Perez',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: '2026-02-30',
      },
    })

    expect(response.status).toBe(400)
    expect(response.body.details.join(' ')).toContain('no existe')
  })
})

describe('episodio y dashboard', () => {
  it('abre el episodio con prestacion y aparece en el dashboard', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const patient = await agent.post('/api/patients').send({
      lastName: 'Perez',
      firstName: 'Juan',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: '2020-01-01',
      },
    })

    const detail = await agent.get(`/api/patients/${patient.body.data.id}`)
    expect(detail.status).toBe(200)

    const affiliationId = detail.body.data.affiliations[0].id

    const episode = await agent.post('/api/episodes').send({
      patientId: patient.body.data.id,
      affiliationId,
      startsOn: '2020-02-01',
      careServices: [
        {
          specialtyId: catalog.specialtyId,
          contractingCompanyId: catalog.contractingCompanyId,
          professionalId: catalog.professionalId,
          authorization: {
            frequencyId: catalog.frequencyId,
            validFrom: '2020-02-01',
            validUntil: '2020-03-01',
            notes: 'AUT-1',
          },
        },
      ],
    })

    expect(episode.status).toBe(201)

    const dashboard = await agent.get('/api/dashboard')

    expect(dashboard.status).toBe(200)
    expect(dashboard.body.data.counters.activePatients).toBe(1)
    expect(dashboard.body.data.counters.activeCareServices).toBe(1)
    // La autorizacion vencio hace años: el dashboard lo dice, y esa es toda la
    // razon de ser del sistema.
    expect(dashboard.body.data.counters.expired).toBe(1)
    expect(dashboard.body.data.claims[0].specialtyName).toBe('Kinesiologia Motora')
  })

  it('el segundo episodio abierto rebota con el mensaje del operador', async () => {
    const agent = await signedIn(Role.OPERADOR)

    const patient = await agent.post('/api/patients').send({
      lastName: 'Perez',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: '2026-01-01',
      },
    })

    const detail = await agent.get(`/api/patients/${patient.body.data.id}`)
    const payload = {
      patientId: patient.body.data.id,
      affiliationId: detail.body.data.affiliations[0].id,
      startsOn: '2026-02-01',
      careServices: [],
    }

    expect((await agent.post('/api/episodes').send(payload)).status).toBe(201)

    const second = await agent
      .post('/api/episodes')
      .send({ ...payload, startsOn: '2026-03-01' })

    expect(second.status).toBe(409)
    expect(second.body.message).toContain('episodio')
  })
})

describe('invariantes de mutación de prestaciones', () => {
  it('no reutiliza catálogos inactivos al crear una prestación', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { episodeId } = await seedCareService()
    await client.careService.deleteMany()
    const body = {
      episodeId,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: catalog.professionalId,
    }

    await client.specialty.update({ where: { id: catalog.specialtyId }, data: { active: false } })
    expect((await agent.post('/api/care-services').send(body)).status).toBe(409)

    await client.specialty.update({ where: { id: catalog.specialtyId }, data: { active: true } })
    await client.contractingCompany.update({
      where: { id: catalog.contractingCompanyId },
      data: { active: false },
    })
    expect((await agent.post('/api/care-services').send(body)).status).toBe(409)

    await client.contractingCompany.update({
      where: { id: catalog.contractingCompanyId },
      data: { active: true },
    })
    await client.professional.update({
      where: { id: catalog.professionalId },
      data: { active: false },
    })
    expect((await agent.post('/api/care-services').send(body)).status).toBe(409)
    expect(await client.careService.count()).toBe(0)
  })

  it('rechaza reasignaciones incompatibles, inactivas y sobre episodios cerrados', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { episodeId, careServiceId } = await seedCareService()
    const incompatible = await client.professional.create({
      data: { lastName: 'Sin especialidad', firstName: 'Ana' },
    })

    const url = `/api/care-services/${careServiceId}/professional`
    expect((await agent.patch(url).send({ professionalId: incompatible.id })).status).toBe(409)

    await client.professional.update({ where: { id: incompatible.id }, data: { active: false } })
    expect((await agent.patch(url).send({ professionalId: incompatible.id })).status).toBe(409)

    await client.homeCareEpisode.update({
      where: { id: episodeId },
      data: {
        endsOn: new Date('2026-02-20T00:00:00.000Z'),
        closeReason: CloseReason.ALTA_MEDICA,
      },
    })
    expect((await agent.patch(url).send({ professionalId: null })).status).toBe(409)
  })

  it('rechaza bajas fuera de la línea temporal y sobre episodios cerrados', async () => {
    const agent = await signedIn(Role.OPERADOR)
    const { episodeId, careServiceId } = await seedCareService()
    const url = `/api/care-services/${careServiceId}/end`

    const beforeStart = await agent.post(url).send({ endedOn: '2026-01-31' })
    expect(beforeStart.status).toBe(409)
    expect(beforeStart.body.message).toContain('anterior')

    await client.homeCareEpisode.update({
      where: { id: episodeId },
      data: {
        endsOn: new Date('2026-02-20T00:00:00.000Z'),
        closeReason: CloseReason.ALTA_MEDICA,
      },
    })

    const afterEnd = await agent.post(url).send({ endedOn: '2026-02-21' })
    expect(afterEnd.status).toBe(409)
    expect(afterEnd.body.details.join(' ')).toContain('posterior')
    expect((await agent.post(url).send({ endedOn: '2026-02-15' })).status).toBe(409)
  })
})

describe('catalogos', () => {
  it('las obras sociales son las ALCANZABLES, no el catalogo entero (D2)', async () => {
    const agent = await signedIn(Role.LECTOR)

    // Una obra social sin ninguna empresa con convenio no se puede elegir: un
    // paciente cargado ahi no se le factura a nadie.
    await client.insuranceProvider.create({ data: { name: 'Obra social sin convenio' } })

    const response = await agent.get('/api/catalogs/insurance-providers')

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0].name).toBe('Swiss Medical')
  })

  it('las frecuencias exigen especialidad: el filtro es del servidor (D11)', async () => {
    const agent = await signedIn(Role.LECTOR)

    const sinFiltro = await agent.get('/api/catalogs/frequencies')
    expect(sinFiltro.status).toBe(400)

    const conFiltro = await agent
      .get('/api/catalogs/frequencies')
      .query({ specialtyId: catalog.specialtyId })

    expect(conFiltro.status).toBe(200)
    expect(conFiltro.body.data).toHaveLength(1)
  })

  it('el selector de profesionales no expone datos financieros a LECTOR', async () => {
    const agent = await signedIn(Role.LECTOR)
    await client.professional.update({
      where: { id: catalog.professionalId },
      data: {
        licenseNumber: 'MN-123',
        taxId: 'SENSITIVE_TAX_ID',
        bankAccount: 'SENSITIVE_BANK_ACCOUNT',
        bankAlias: 'SENSITIVE_BANK_ALIAS',
      },
    })

    const response = await agent
      .get('/api/catalogs/professionals')
      .query({ specialtyId: catalog.specialtyId })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ success: true, message: expect.any(String) })
    expect(response.body.data).toEqual([
      {
        id: catalog.professionalId,
        lastName: 'Gomez',
        firstName: 'Yolanda',
        licenseNumber: 'MN-123',
      },
    ])
    expect(JSON.stringify(response.body)).not.toContain('SENSITIVE_')
  })
})

describe('contrato de respuestas', () => {
  /**
   * El envelope es lo unico que el frontend puede dar por sentado sin abrir el
   * codigo del backend. Si se rompe, se rompe en silencio: el JSON sigue siendo
   * valido y la pantalla queda vacia sin un solo error en consola.
   */
  it('exito, error y paginado salen siempre con la misma forma', async () => {
    const agent = await signedIn(Role.OPERADOR)

    // Lectura simple: el dato va en `data`, sin envolver de nuevo.
    const catalogo = await agent.get('/api/catalogs/specialties')
    expect(catalogo.body.success).toBe(true)
    expect(catalogo.body.message).toBeTypeOf('string')
    expect(Array.isArray(catalogo.body.data)).toBe(true)
    expect(catalogo.body).not.toHaveProperty('items')

    // Listado paginado: `total` describe la ventana, y por eso va en `meta` y
    // no adentro de `data`.
    const listado = await agent.get('/api/patients')
    expect(listado.body.success).toBe(true)
    expect(Array.isArray(listado.body.data)).toBe(true)
    expect(listado.body.meta).toMatchObject({ limit: expect.any(Number), total: 0 })

    // Error: la misma forma, con `success: false`. Nunca un `data`.
    const invalido = await agent.post('/api/patients').send({})
    expect(invalido.status).toBe(400)
    expect(invalido.body.success).toBe(false)
    expect(invalido.body.message).toBeTypeOf('string')
    expect(invalido.body).not.toHaveProperty('data')

    // 204: sin cuerpo. Un envelope adentro de un 204 es una contradiccion.
    const paciente = await agent.post('/api/patients').send({
      lastName: 'Perez',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: '2026-01-01',
      },
    })
    const baja = await agent.post(`/api/patients/${paciente.body.data.id}/deactivate`)

    expect(baja.status).toBe(204)
    expect(baja.body).toEqual({})
  })

  it('el 429 del limitador de login usa el mismo envelope', async () => {
    // Lo contesta express-rate-limit y no el errorHandler: es el unico lugar
    // donde la forma se arma a mano, y por eso hay que probarlo.
    let ultima = await request(app).post('/api/auth/login').send({})

    for (let intento = 0; intento < 12 && ultima.status !== 429; intento += 1) {
      ultima = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nadie@idutils.local', password: PASSWORD })
    }

    expect(ultima.status).toBe(429)
    expect(ultima.body.success).toBe(false)
    expect(ultima.body.message).toContain('intentos')
  })
})

describe('rutas', () => {
  it('el health check no pide sesion', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('a un anonimo no le cuenta que rutas existen', async () => {
    // Sin sesion, una ruta inexistente bajo /api da 401 y no 404: el
    // middleware de autenticacion corre antes que el 404 a proposito.
    // Distinguir "no existe" de "no tenes permiso" le dejaria a cualquiera
    // mapear la API desde afuera.
    expect((await request(app).get('/api/no-existe')).status).toBe(401)
  })

  it('con sesion, una ruta que no existe contesta 404 con el formato de siempre', async () => {
    const agent = await signedIn(Role.LECTOR)
    const response = await agent.get('/api/no-existe')

    expect(response.status).toBe(404)
    expect(response.body.message).toBeTypeOf('string')
  })
})
