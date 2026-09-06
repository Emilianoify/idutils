import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { CloseReason } from '../../src/generated/prisma/enums.js'
import { GetDashboardUseCase } from '../../src/application/useCases/dashboard/getDashboardUseCase.js'
import { AuthorizationStatus } from '../../src/domain/enums/authorizationStatus.js'
import { WorkQueue } from '../../src/domain/enums/workQueue.js'
import type { IClock } from '../../src/domain/repositories/IClock.js'
import type { Infrastructure } from '../../src/infrastructure/container.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { parseDateOnly } from '../../src/shared/helpers/dateOnly.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

/**
 * El dashboard entero, de Postgres a la pantalla.
 *
 * Lo que se prueba aca es la costura: que las consultas de lectura traigan las
 * filas correctas CRUDAS, y que el veredicto lo siga poniendo `coverageAt`
 * sobre esos datos. Si algun dia una query empieza a decidir "por vencer" por
 * su cuenta, estos numeros se van a poder cumplir de dos formas distintas.
 */

class FixedClock implements IClock {
  constructor(private readonly date: Date) {}
  today(): Date {
    return this.date
  }
}

const TODAY = parseDateOnly('2026-09-20')
const WARNING_DAYS = 30

let client: PrismaClient
let infrastructure: Infrastructure
let catalog: SeededCatalog

beforeAll(async () => {
  client = await createTestClient()
  infrastructure = createInfrastructure(client)
})

afterAll(async () => {
  await client.$disconnect()
})

beforeEach(async () => {
  await resetDatabase(client)
  catalog = await seedCatalog(client)
})

/** Un paciente con afiliacion vigente, cargado directo para no repetir el alta. */
async function newPatient(lastName: string, memberNumber: string): Promise<{
  patientId: string
  affiliationId: string
}> {
  const patient = await client.patient.create({
    data: {
      lastName,
      firstName: 'Juan',
      addressStreet: 'Rivadavia 4321',
      localityId: catalog.localityId,
    },
  })

  const affiliation = await client.affiliation.create({
    data: {
      patientId: patient.id,
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber,
      from: parseDateOnly('2026-01-01'),
    },
  })

  return { patientId: patient.id, affiliationId: affiliation.id }
}

function dashboard(): GetDashboardUseCase {
  return new GetDashboardUseCase(
    infrastructure.dashboard,
    new FixedClock(TODAY),
    WARNING_DAYS,
  )
}

describe('lectura del dashboard contra Postgres', () => {
  it('trae la prestacion activa con los nombres ya cruzados y sin veredicto', async () => {
    const { patientId, affiliationId } = await newPatient('Perez', '111')

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    const careService = await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: catalog.professionalId,
    })

    await infrastructure.authorizations.create({
      careServiceId: careService.id,
      frequencyId: catalog.frequencyId,
      frequencyAmount: 2,
      frequencyUnit: 'SEMANAL',
      validFrom: parseDateOnly('2026-08-01'),
      validUntil: parseDateOnly('2026-09-30'),
      notes: 'AUT-4471',
    })

    const rows = await infrastructure.dashboard.listActiveCareServices(TODAY)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      patientLastName: 'Perez',
      specialtyName: 'Kinesiologia Motora',
      contractingCompanyName: 'SanityCare',
      professionalLastName: 'Gomez',
      // Viaja la unidad de servicio, NO la etiqueta ya armada: el sustantivo lo
      // decide `formatFrequency` en un solo lugar (D11).
      serviceUnit: 'SESION',
    })
    expect(rows[0]?.authorizations).toHaveLength(1)
  })

  it('no trae prestaciones de un episodio que todavia no empezo', async () => {
    // Abierto pero con `startsOn` futuro: el paciente vuelve el jueves y hoy
    // todavia no esta activo.
    const { patientId, affiliationId } = await newPatient('Futuro', '222')

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-12-01'),
    })

    await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    expect(await infrastructure.dashboard.listActiveCareServices(TODAY)).toHaveLength(0)
    expect(await infrastructure.dashboard.countActivePatients(TODAY)).toBe(0)
  })

  it('cuenta como activo al paciente sin ninguna prestacion cargada', async () => {
    // Es un alta a medio hacer. Esconderla del contador es perderla de vista,
    // que es justo lo que el sistema vino a evitar.
    const withServices = await newPatient('Perez', '111')
    const empty = await newPatient('Solo', '222')

    const episode = await infrastructure.episodes.create({
      patientId: withServices.patientId,
      affiliationId: withServices.affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    await infrastructure.episodes.create({
      patientId: empty.patientId,
      affiliationId: empty.affiliationId,
      startsOn: parseDateOnly('2026-02-01'),
    })

    const summary = await dashboard().execute()

    expect(summary.counters.activePatients).toBe(2)
    expect(summary.counters.activeCareServices).toBe(1)
  })
})

describe('el veredicto lo pone el dominio, no la query', () => {
  it('marca POR_VENCER lo que vence dentro del umbral y lo lleva a reclamos', async () => {
    const { patientId, affiliationId } = await newPatient('Perez', '111')

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    const careService = await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: catalog.professionalId,
    })

    // Vence el 30/9, hoy es el 20/9, el umbral son 30 dias: entra por 10.
    await infrastructure.authorizations.create({
      careServiceId: careService.id,
      frequencyId: catalog.frequencyId,
      frequencyAmount: 2,
      frequencyUnit: 'SEMANAL',
      validFrom: parseDateOnly('2026-08-01'),
      validUntil: parseDateOnly('2026-09-30'),
      notes: '',
    })

    const summary = await dashboard().execute()

    expect(summary.counters.expiringSoon).toBe(1)
    expect(summary.counters.expired).toBe(0)
    expect(summary.claims).toHaveLength(1)
    expect(summary.claims[0]).toMatchObject({
      status: AuthorizationStatus.POR_VENCER,
      daysUntilExpiry: 10,
      // El sustantivo sale de la especialidad, no de la frecuencia (D11).
      frequencyLabel: '2 sesiones semanales',
      contractingCompanyName: 'SanityCare',
    })
    expect(summary.byCompany[0]?.pendingClaims).toBe(1)
  })

  it('distingue SIN_AUTORIZACION de VENCIDA', async () => {
    const never = await newPatient('Nunca', '111')
    const expired = await newPatient('Vencida', '222')

    const neverEpisode = await infrastructure.episodes.create({
      patientId: never.patientId,
      affiliationId: never.affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    await infrastructure.careServices.create({
      episodeId: neverEpisode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    const expiredEpisode = await infrastructure.episodes.create({
      patientId: expired.patientId,
      affiliationId: expired.affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    const expiredService = await infrastructure.careServices.create({
      episodeId: expiredEpisode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    await infrastructure.authorizations.create({
      careServiceId: expiredService.id,
      frequencyId: catalog.frequencyId,
      frequencyAmount: 2,
      frequencyUnit: 'SEMANAL',
      validFrom: parseDateOnly('2026-05-01'),
      validUntil: parseDateOnly('2026-06-30'),
      notes: '',
    })

    const summary = await dashboard().execute()

    // Nunca autorizada no es lo mismo que se vencio: el reclamo es distinto.
    expect(summary.counters.withoutAuthorization).toBe(1)
    expect(summary.counters.expired).toBe(1)
    expect(summary.counters.pendingClaims).toBe(2)
  })
})

describe('bandejas de trabajo', () => {
  it('el paciente internado queda en ESPERANDO_ALTA con los dias esperando', async () => {
    const { patientId, affiliationId } = await newPatient('Internado', '111')

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    await infrastructure.episodes.close(episode.id, {
      endsOn: parseDateOnly('2026-09-10'),
      closeReason: CloseReason.INTERNACION,
      closeNote: 'Sanatorio Anchorena',
    })

    const summary = await dashboard().execute()

    expect(summary.counters.activePatients).toBe(0)
    expect(summary.workQueues).toHaveLength(1)
    expect(summary.workQueues[0]).toMatchObject({
      queue: WorkQueue.ESPERANDO_ALTA,
      patientName: 'Internado, Juan',
      closeNote: 'Sanatorio Anchorena',
      daysWaiting: 10,
    })
  })

  it('el paciente que ya reingreso SALE de la bandeja', async () => {
    // Sin el corte por ultimo episodio, un paciente que volvio seguiria
    // figurando en "esperando alta" para siempre y la bandeja dejaria de
    // significar algo.
    const { patientId, affiliationId } = await newPatient('Volvio', '111')

    const first = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    await infrastructure.episodes.close(first.id, {
      endsOn: parseDateOnly('2026-08-01'),
      closeReason: CloseReason.INTERNACION,
    })

    await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-08-20'),
    })

    const summary = await dashboard().execute()

    expect(summary.workQueues).toHaveLength(0)
    expect(summary.counters.activePatients).toBe(1)
  })

  it('el alta medica no es una bandeja: no hay nada que hacer', async () => {
    const { patientId, affiliationId } = await newPatient('Alta', '111')

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-15'),
    })

    await infrastructure.episodes.close(episode.id, {
      endsOn: parseDateOnly('2026-09-01'),
      closeReason: CloseReason.ALTA_MEDICA,
    })

    expect((await dashboard().execute()).workQueues).toHaveLength(0)
  })
})
