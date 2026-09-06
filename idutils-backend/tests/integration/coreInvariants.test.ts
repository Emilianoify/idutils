import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { CloseReason } from '../../src/generated/prisma/enums.js'
import { CreatePatientUseCase } from '../../src/application/useCases/patient/createPatientUseCase.js'
import type { Infrastructure } from '../../src/infrastructure/container.js'
import { createInfrastructure } from '../../src/infrastructure/container.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import { parseDateOnly, toDateOnlyString } from '../../src/shared/helpers/dateOnly.js'
import type { SeededCatalog } from './helpers/database.js'
import { createTestClient, resetDatabase, seedCatalog } from './helpers/database.js'

/**
 * Los invariantes del core, contra Postgres.
 *
 * Todo lo que se prueba aca es lo que un fake en memoria NO puede probar: que
 * la constraint existe, que rechaza, y que ese rechazo llega al operador como
 * una instruccion y no como un nombre de indice.
 *
 * Si estos tests pasan, `core_invariants.sql` esta aplicado de verdad. Si el
 * `cat` de la instalacion se saltea, fallan todos juntos y de entrada: es el
 * unico modo de que ese paso no se olvide en silencio.
 */

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

/** El alta minima que usan casi todos los tests de abajo. */
async function createPatient(options: {
  lastName?: string
  memberNumber?: string
  from?: Date
}): Promise<{ patientId: string; affiliationId: string }> {
  const useCase = new CreatePatientUseCase(
    infrastructure.unitOfWork,
    infrastructure.insuranceProviders,
    infrastructure.localities,
  )

  const summary = await useCase.execute({
    lastName: options.lastName ?? 'Perez',
    firstName: 'Juan',
    documentNumber: null,
    birthDate: null,
    addressStreet: 'Rivadavia 4321',
    addressDetail: null,
    localityId: catalog.localityId,
    notes: '',
    affiliation: {
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: options.memberNumber ?? '00123-456',
      from: options.from ?? parseDateOnly('2026-01-01'),
    },
    contacts: [],
  })

  const affiliation = await infrastructure.affiliations.findCurrentByPatient(summary.id)
  if (affiliation === null) throw new Error('El alta no dejo afiliacion vigente')

  return { patientId: summary.id, affiliationId: affiliation.id }
}

describe('alta de paciente contra Postgres', () => {
  it('crea paciente, afiliacion y contacto en una sola transaccion', async () => {
    const useCase = new CreatePatientUseCase(
      infrastructure.unitOfWork,
      infrastructure.insuranceProviders,
      infrastructure.localities,
    )

    const summary = await useCase.execute({
      lastName: 'Perez',
      firstName: 'Juan',
      documentNumber: '12345678',
      birthDate: parseDateOnly('1940-05-12'),
      addressStreet: 'Rivadavia 4321',
      addressDetail: '3 B',
      localityId: catalog.localityId,
      notes: 'Timbre roto',
      affiliation: {
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '00123-456',
        from: parseDateOnly('2026-01-01'),
      },
      contacts: [{ name: 'Ana', relationship: 'hija', phone: '1155667788', isPrimary: true }],
    })

    expect(await client.patient.count()).toBe(1)
    expect(await client.affiliation.count()).toBe(1)
    expect(await client.patientContact.count()).toBe(1)

    // El numero se guarda NORMALIZADO: es lo unico que hace servir al indice
    // unico parcial. Guardarlo crudo deja duplicar en silencio.
    expect(summary.memberNumber).toBe('123456')
    const stored = await client.affiliation.findFirstOrThrow()
    expect(stored.memberNumber).toBe('123456')
  })

  it('una fecha civil sobrevive el viaje a la base sin correrse de dia', async () => {
    // El bug que este proyecto ya pago una vez: un Date con hora interpretado
    // en huso local arranca el episodio un dia antes en produccion y bien en la
    // maquina del que lo programo.
    await createPatient({ from: parseDateOnly('2026-01-22') })

    const affiliation = await client.affiliation.findFirstOrThrow()
    expect(toDateOnlyString(affiliation.from)).toBe('2026-01-22')

    const [mapped] = await infrastructure.affiliations.listByPatient(
      affiliation.patientId,
    )
    expect(mapped?.from.toISOString()).toBe('2026-01-22T00:00:00.000Z')
  })

  it('si algo falla a mitad de la transaccion no queda NADA', async () => {
    // Es la prueba que ningun mock da: que el rollback sea real. Sin esto,
    // repositorios construidos fuera del $transaction pasarian los tests con
    // fakes y dejarian pacientes sin afiliacion en produccion.
    const boom = new Error('falla despues del primer INSERT');

    await expect(
      infrastructure.unitOfWork.run(async (repositories) => {
        await repositories.patients.create({
          lastName: 'Fantasma',
          firstName: '',
          documentNumber: null,
          birthDate: null,
          addressStreet: 'Calle 1',
          addressDetail: null,
          localityId: catalog.localityId,
          notes: '',
        })

        throw boom
      }),
    ).rejects.toBe(boom)

    expect(await client.patient.count()).toBe(0)
  })
})

describe('D8 - unicidad de la afiliacion entre las vigentes', () => {
  it('rechaza otra afiliacion vigente con el mismo numero y da el mensaje util', async () => {
    const first = await createPatient({ memberNumber: '123456' })
    const other = await createPatient({ lastName: 'Gonzalez', memberNumber: '999' })

    // Se ataca el repositorio directo, salteando la validacion del caso de uso:
    // lo que se prueba es que la BASE rechaza y que el traductor convierte esa
    // violacion en una instruccion.
    await expect(
      infrastructure.affiliations.create({
        patientId: other.patientId,
        insuranceProviderId: catalog.insuranceProviderId,
        memberNumber: '123456',
        from: parseDateOnly('2026-03-01'),
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 409,
      message: ERROR_MESSAGES.AFFILIATION.ALREADY_TAKEN,
    })

    expect(first.patientId).not.toBe(other.patientId)
    expect(await client.affiliation.count()).toBe(2)
  })

  it('permite volver a la misma obra social con el mismo numero si la anterior esta cerrada', async () => {
    // El indice es PARCIAL a proposito: un unique total prohibiria esto y
    // obligaria a pisar el historial, que es justo lo que el Excel hace mal.
    const { patientId, affiliationId } = await createPatient({ memberNumber: '123456' })

    await infrastructure.affiliations.close(affiliationId, parseDateOnly('2026-06-01'))

    const renewed = await infrastructure.affiliations.create({
      patientId,
      insuranceProviderId: catalog.insuranceProviderId,
      memberNumber: '123456',
      from: parseDateOnly('2026-09-01'),
    })

    expect(renewed.to).toBeNull()
    expect(await client.affiliation.count()).toBe(2)
  })

  it('rechaza cerrar una afiliacion antes de su inicio', async () => {
    const { affiliationId } = await createPatient({ from: parseDateOnly('2026-01-10') })

    await expect(
      infrastructure.affiliations.close(affiliationId, parseDateOnly('2026-01-01')),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: ERROR_MESSAGES.AFFILIATION.CLOSES_BEFORE_START,
    })
  })
})

describe('D9 - episodios no solapados', () => {
  it('rechaza un segundo episodio abierto y explica que revisar', async () => {
    const { patientId, affiliationId } = await createPatient({})

    await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-10'),
    })

    // Dos episodios abiertos se solapan siempre: el EXCLUDE cubre "un solo
    // episodio abierto por paciente" sin una regla aparte.
    await expect(
      infrastructure.episodes.create({
        patientId,
        affiliationId,
        startsOn: parseDateOnly('2026-02-01'),
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 409,
      message: ERROR_MESSAGES.EPISODE.OVERLAPS,
    })

    expect(await client.homeCareEpisode.count()).toBe(1)
  })

  it('acepta el reingreso el mismo dia en que cerro el anterior', async () => {
    // El rango es semiabierto '[)': cerrar el 18/1 y reabrir el 18/1 NO se
    // solapa, que es exactamente como se lee un reingreso.
    const { patientId, affiliationId } = await createPatient({})

    const first = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-01'),
    })

    await infrastructure.episodes.close(first.id, {
      endsOn: parseDateOnly('2026-01-18'),
      closeReason: CloseReason.INTERNACION,
      closeNote: 'Sanatorio Anchorena',
    })

    const readmission = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-18'),
    })

    expect(readmission.endsOn).toBeNull()
    expect(await client.homeCareEpisode.count()).toBe(2)
  })

  it('rechaza cerrar un episodio antes de su inicio', async () => {
    const { patientId, affiliationId } = await createPatient({})

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-02-01'),
    })

    await expect(
      infrastructure.episodes.close(episode.id, {
        endsOn: parseDateOnly('2026-01-15'),
        closeReason: CloseReason.ALTA_MEDICA,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: ERROR_MESSAGES.EPISODE.CLOSES_BEFORE_START,
    })
  })
})

describe('D7 - unicidad de la prestacion entre las activas', () => {
  it('rechaza la misma especialidad y empresa dos veces en el episodio', async () => {
    const { patientId, affiliationId } = await createPatient({})

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-01'),
    })

    await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    await expect(
      infrastructure.careServices.create({
        episodeId: episode.id,
        specialtyId: catalog.specialtyId,
        contractingCompanyId: catalog.contractingCompanyId,
        professionalId: catalog.professionalId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.CARE_SERVICE.DUPLICATED,
    })
  })

  it('deja volver a cargarla despues de darla de baja', async () => {
    const { patientId, affiliationId } = await createPatient({})

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-01'),
    })

    const careService = await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    await infrastructure.careServices.end(careService.id, parseDateOnly('2026-03-01'))

    const reloaded = await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    expect(reloaded.endedOn).toBeNull()
    expect(await client.careService.count()).toBe(2)
  })
})

describe('D10 - coherencia del periodo autorizado', () => {
  it('rechaza una autorizacion que vence antes de empezar', async () => {
    const { patientId, affiliationId } = await createPatient({})

    const episode = await infrastructure.episodes.create({
      patientId,
      affiliationId,
      startsOn: parseDateOnly('2026-01-01'),
    })

    const careService = await infrastructure.careServices.create({
      episodeId: episode.id,
      specialtyId: catalog.specialtyId,
      contractingCompanyId: catalog.contractingCompanyId,
      professionalId: null,
    })

    await expect(
      infrastructure.authorizations.create({
        careServiceId: careService.id,
        frequencyId: catalog.frequencyId,
        frequencyAmount: 2,
        frequencyUnit: 'SEMANAL',
        validFrom: parseDateOnly('2026-09-30'),
        validUntil: parseDateOnly('2026-08-01'),
        notes: '',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: ERROR_MESSAGES.AUTHORIZATION.PERIODO_INVALIDO,
    })
  })
})

describe('D15 - un solo contacto principal por paciente', () => {
  it('cambia el principal bajando al anterior en la misma transaccion', async () => {
    const { patientId } = await createPatient({})

    const first = await infrastructure.patients.addContact({
      patientId,
      name: 'Ana',
      relationship: 'hija',
      phone: '1155667788',
      isPrimary: true,
    })

    const second = await infrastructure.patients.addContact({
      patientId,
      name: 'Carlos',
      relationship: 'hijo',
      phone: '1144556677',
      isPrimary: false,
    })

    await infrastructure.patients.setPrimaryContact(patientId, second.id)

    const contacts = await infrastructure.patients.listContacts(patientId)
    const primary = contacts.filter((contact) => contact.isPrimary)

    expect(primary).toHaveLength(1)
    expect(primary[0]?.id).toBe(second.id)
    expect(contacts.find((contact) => contact.id === first.id)?.isPrimary).toBe(false)
  })

  it('rechaza marcar como principal un contacto de otro paciente', async () => {
    const owner = await createPatient({ memberNumber: '111' })
    const stranger = await createPatient({ lastName: 'Lopez', memberNumber: '222' })

    const foreign = await infrastructure.patients.addContact({
      patientId: stranger.patientId,
      name: 'Ajeno',
      relationship: 'vecino',
      phone: '1100000000',
      isPrimary: false,
    })

    await expect(
      infrastructure.patients.setPrimaryContact(owner.patientId, foreign.id),
    ).rejects.toMatchObject({ statusCode: 404 })

    // El rollback tiene que haber devuelto el contacto ajeno como estaba.
    const untouched = await client.patientContact.findFirstOrThrow({ where: { id: foreign.id } })
    expect(untouched.isPrimary).toBe(false)
  })
})
