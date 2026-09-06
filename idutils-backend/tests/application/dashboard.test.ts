import { beforeEach, describe, expect, it } from 'vitest'
import { GetDashboardUseCase } from '../../src/application/useCases/dashboard/getDashboardUseCase.js'
import { ClaimAuthorizationUseCase } from '../../src/application/useCases/authorization/claimAuthorizationUseCase.js'
import { AuthorizationStatus } from '../../src/domain/enums/authorizationStatus.js'
import { WorkQueue } from '../../src/domain/enums/workQueue.js'
import type { CloseReason } from '../../src/generated/prisma/enums.js'
import { d } from '../helpers/factories.js'
import {
  FixedClock,
  InMemoryStore,
  createAuthorizationRepository,
  createDashboardQuery,
  seedCatalog,
} from '../helpers/inMemory.js'

const HOY = d('2026-08-28')
const EPOCH = d('2026-01-01')

function stamps() {
  return { createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null }
}

describe('GetDashboardUseCase', () => {
  let store: InMemoryStore
  let catalog: ReturnType<typeof seedCatalog>
  let useCase: GetDashboardUseCase
  let counter = 0

  /** Un paciente con episodio y, si corresponde, una prestacion autorizada. */
  function addPatient(options: {
    lastName: string
    closeReason?: CloseReason
    endsOn?: string
    authorizations?: { validFrom: string; validUntil: string; claimedAt?: string }[]
    withCareService?: boolean
  }): { patientId: string; authorizationIds: string[] } {
    counter += 1
    const patientId = `patient-${counter}`
    const episodeId = `episode-${counter}`
    const careServiceId = `care-service-${counter}`

    store.patients.push({
      id: patientId,
      lastName: options.lastName,
      firstName: 'Juan',
      documentNumber: null,
      birthDate: null,
      addressStreet: 'Rivadavia 4500',
      addressDetail: null,
      localityId: catalog.localityId,
      notes: '',
      ...stamps(),
    })

    store.affiliations.push({
      id: `affiliation-${counter}`,
      patientId,
      insuranceProviderId: catalog.providerId,
      memberNumber: `${counter}`,
      from: EPOCH,
      to: null,
      ...stamps(),
    })

    store.episodes.push({
      id: episodeId,
      patientId,
      affiliationId: `affiliation-${counter}`,
      startsOn: d('2026-01-15'),
      endsOn: options.endsOn === undefined ? null : d(options.endsOn),
      closeReason: options.closeReason ?? null,
      closeNote: null,
      ...stamps(),
    })

    const authorizationIds: string[] = []

    if (options.withCareService !== false) {
      store.careServices.push({
        id: careServiceId,
        episodeId,
        specialtyId: catalog.specialtyId,
        contractingCompanyId: catalog.companyId,
        professionalId: catalog.professionalId,
        endedOn: null,
        ...stamps(),
      })

      for (const [index, authorization] of (options.authorizations ?? []).entries()) {
        const id = `authorization-${counter}-${index}`
        authorizationIds.push(id)
        store.authorizations.push({
          id,
          careServiceId,
          frequencyId: catalog.frequencyId,
          frequencyAmount: 2,
          frequencyUnit: 'SEMANAL',
          validFrom: d(authorization.validFrom),
          validUntil: d(authorization.validUntil),
          claimedAt: authorization.claimedAt === undefined ? null : d(authorization.claimedAt),
          notes: '',
          ...stamps(),
        })
      }
    }

    return { patientId, authorizationIds }
  }

  beforeEach(() => {
    counter = 0
    store = new InMemoryStore()
    catalog = seedCatalog(store)
    useCase = new GetDashboardUseCase(createDashboardQuery(store), new FixedClock(HOY))
  })

  it('cuenta lo que el operador tiene que mirar hoy', async () => {
    addPatient({ lastName: 'Vigente', authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-12-31' }] })
    addPatient({ lastName: 'PorVencer', authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-09-15' }] })
    addPatient({ lastName: 'Vencida', authorizations: [{ validFrom: '2026-01-01', validUntil: '2026-08-20' }] })
    addPatient({ lastName: 'SinAutorizar', authorizations: [] })
    addPatient({ lastName: 'Internado', endsOn: '2026-08-25', closeReason: 'INTERNACION' })

    const dashboard = await useCase.execute()

    // El internado no cuenta como activo: su episodio esta cerrado.
    expect(dashboard.counters.activePatients).toBe(4)
    expect(dashboard.counters.activeCareServices).toBe(4)
    expect(dashboard.counters.expiringSoon).toBe(1)
    expect(dashboard.counters.expired).toBe(1)
    expect(dashboard.counters.withoutAuthorization).toBe(1)
    expect(dashboard.counters.pendingClaims).toBe(3)
  })

  it('ordena los reclamos por urgencia, no por fecha de carga', async () => {
    // Una lista ordenada por fecha de carga es una lista que nadie mira.
    addPatient({ lastName: 'PorVencer', authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-09-15' }] })
    addPatient({ lastName: 'SinAutorizar', authorizations: [] })
    addPatient({ lastName: 'Vencida', authorizations: [{ validFrom: '2026-01-01', validUntil: '2026-08-20' }] })

    const dashboard = await useCase.execute()

    expect(dashboard.claims.map((claim) => claim.status)).toEqual([
      AuthorizationStatus.VENCIDA,
      AuthorizationStatus.SIN_AUTORIZACION,
      AuthorizationStatus.POR_VENCER,
    ])
  })

  it('renderiza la frecuencia con el sustantivo de la especialidad', async () => {
    addPatient({ lastName: 'PorVencer', authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-09-15' }] })

    const dashboard = await useCase.execute()

    // La especialidad del catálogo es Kinesiología, con serviceUnit SESION.
    expect(dashboard.claims[0]?.frequencyLabel).toBe('2 sesiones semanales')
    expect(dashboard.claims[0]?.daysUntilExpiry).toBe(18)
  })

  it('lo ya reclamado sale de pendientes pero sigue por vencer', async () => {
    addPatient({
      lastName: 'Reclamada',
      authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-09-15', claimedAt: '2026-08-20' }],
    })

    const dashboard = await useCase.execute()

    expect(dashboard.counters.expiringSoon).toBe(1)
    expect(dashboard.counters.pendingClaims).toBe(0)
    expect(dashboard.claims).toHaveLength(0)
  })

  it('una vencida con la renovacion ya cargada no se vuelve a reclamar', async () => {
    addPatient({
      lastName: 'Renovada',
      authorizations: [
        { validFrom: '2026-01-01', validUntil: '2026-08-20' },
        { validFrom: '2026-09-01', validUntil: '2026-12-31' },
      ],
    })

    const dashboard = await useCase.execute()

    expect(dashboard.counters.expired).toBe(1)
    expect(dashboard.counters.pendingClaims).toBe(0)
    expect(dashboard.claims).toHaveLength(0)
  })

  it('el internado no desaparece de la pantalla', async () => {
    // Si desaparece, volvimos a que la coordinadora se acuerde de memoria.
    addPatient({ lastName: 'Internado', endsOn: '2026-08-25', closeReason: 'INTERNACION' })
    addPatient({ lastName: 'Reautorizar', endsOn: '2026-08-01', closeReason: 'CAMBIO_OBRA_SOCIAL' })
    addPatient({ lastName: 'Fallecido', endsOn: '2026-08-01', closeReason: 'FALLECIMIENTO' })
    addPatient({ lastName: 'Alta', endsOn: '2026-08-01', closeReason: 'ALTA_MEDICA' })

    const dashboard = await useCase.execute()

    // Solo las dos bandejas de trabajo. Archivo y cerrado no son pendientes.
    expect(dashboard.workQueues).toHaveLength(2)
    expect(dashboard.workQueues[0]?.queue).toBe(WorkQueue.REAUTORIZAR)
    expect(dashboard.workQueues[1]?.queue).toBe(WorkQueue.ESPERANDO_ALTA)
    expect(dashboard.workQueues[1]?.daysWaiting).toBe(3)
  })

  it('agrupa por empresa, que es a quien hay que llamar', async () => {
    addPatient({ lastName: 'Uno', authorizations: [{ validFrom: '2026-01-01', validUntil: '2026-08-20' }] })
    addPatient({ lastName: 'Dos', authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-12-31' }] })

    const dashboard = await useCase.execute()

    expect(dashboard.byCompany).toHaveLength(1)
    expect(dashboard.byCompany[0]).toMatchObject({
      contractingCompanyName: 'SanityCare',
      activeCareServices: 2,
      expired: 1,
      pendingClaims: 1,
    })
  })

  it('reclamar saca la prestacion de la lista sin tocar el vencimiento', async () => {
    const { authorizationIds } = addPatient({
      lastName: 'PorVencer',
      authorizations: [{ validFrom: '2026-08-01', validUntil: '2026-09-15' }],
    })

    expect((await useCase.execute()).counters.pendingClaims).toBe(1)

    await new ClaimAuthorizationUseCase(
      createAuthorizationRepository(store),
      new FixedClock(HOY),
    ).execute(authorizationIds[0] ?? '')

    const after = await useCase.execute()

    expect(after.counters.pendingClaims).toBe(0)
    expect(after.counters.expiringSoon).toBe(1)
    expect(after.claims).toHaveLength(0)
  })
})
