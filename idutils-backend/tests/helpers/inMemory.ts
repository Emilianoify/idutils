import type { Affiliation } from '../../src/domain/entities/affiliationEntity.js'
import type { Authorization } from '../../src/domain/entities/authorizationEntity.js'
import type { CareService } from '../../src/domain/entities/careServiceEntity.js'
import type { ContractingCompany } from '../../src/domain/entities/contractingCompanyEntity.js'
import type { Frequency } from '../../src/domain/entities/frequencyEntity.js'
import type { HomeCareEpisode } from '../../src/domain/entities/homeCareEpisodeEntity.js'
import type { InsuranceProvider } from '../../src/domain/entities/insuranceProviderEntity.js'
import type { Locality } from '../../src/domain/entities/localityEntity.js'
import type { Patient, PatientContact } from '../../src/domain/entities/patientEntity.js'
import type { Professional } from '../../src/domain/entities/professionalEntity.js'
import type { Specialty } from '../../src/domain/entities/specialtyEntity.js'
import type { IAffiliationRepository } from '../../src/domain/repositories/IAffiliationRepository.js'
import {
  AuthorizationCreateFailure,
  type IAuthorizationRepository,
} from '../../src/domain/repositories/IAuthorizationRepository.js'
import type { ICareServiceRepository } from '../../src/domain/repositories/ICareServiceRepository.js'
import type {
  IContractingCompanyRepository,
  IFrequencyRepository,
  IInsuranceProviderRepository,
  ILocalityRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../src/domain/repositories/ICatalogRepository.js'
import type { IClock } from '../../src/domain/repositories/IClock.js'
import type {
  ActiveCareServiceRow,
  IDashboardQuery,
  PendingEpisodeRow,
} from '../../src/domain/repositories/IDashboardQuery.js'
import type { IHomeCareEpisodeRepository } from '../../src/domain/repositories/IHomeCareEpisodeRepository.js'
import type { IPatientRepository } from '../../src/domain/repositories/IPatientRepository.js'
import type { IUnitOfWork, TransactionalRepositories } from '../../src/domain/repositories/IUnitOfWork.js'

/** Lo que no hace falta para el caso de uso bajo prueba grita, no miente. */
function notImplemented(name: string): never {
  throw new Error(`El repositorio en memoria no implementa ${name}`)
}

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${sequence}`
}

const EPOCH = new Date('2026-01-01T00:00:00.000Z')

function stamps(): { createdAt: Date; updatedAt: Date; deletedAt: null } {
  return { createdAt: EPOCH, updatedAt: EPOCH, deletedAt: null }
}

/** Todas las tablas del core, en arrays. */
export class InMemoryStore {
  patients: Patient[] = []
  contacts: PatientContact[] = []
  affiliations: Affiliation[] = []
  episodes: HomeCareEpisode[] = []
  careServices: CareService[] = []
  authorizations: Authorization[] = []
  specialties: Specialty[] = []
  frequencies: Frequency[] = []
  specialtyFrequencies: { specialtyId: string; frequencyId: string }[] = []
  professionals: Professional[] = []
  professionalSpecialties: { professionalId: string; specialtyId: string }[] = []
  companies: ContractingCompany[] = []
  companyProviders: { contractingCompanyId: string; insuranceProviderId: string }[] = []
  providers: InsuranceProvider[] = []
  localities: Locality[] = []

  snapshot(): InMemoryStore {
    const copy = new InMemoryStore()
    for (const key of Object.keys(this) as (keyof InMemoryStore)[]) {
      const value = this[key]
      if (Array.isArray(value)) {
        // Copia superficial de cada fila: alcanza porque los casos de uso
        // reemplazan filas, no mutan campos en el lugar.
        Object.assign(copy, { [key]: value.map((row) => ({ ...row })) })
      }
    }
    return copy
  }

  restoreFrom(snapshot: InMemoryStore): void {
    for (const key of Object.keys(snapshot) as (keyof InMemoryStore)[]) {
      const value = snapshot[key]
      if (Array.isArray(value)) {
        Object.assign(this, { [key]: value.map((row) => ({ ...row })) })
      }
    }
  }
}

export class FixedClock implements IClock {
  constructor(private readonly date: Date) {}
  today(): Date {
    return this.date
  }
}

/**
 * UnitOfWork falso CON ROLLBACK REAL sobre el store.
 *
 * Podria haber sido un `run(work) { return work(repos) }` de una linea, pero
 * entonces los tests no probarian nada de lo que la transaccion existe para
 * garantizar: que si el segundo INSERT falla, el primero no queda. Con
 * snapshot y restore, un test puede afirmar que el paciente NO se creo.
 */
export class InMemoryUnitOfWork implements IUnitOfWork {
  constructor(private readonly store: InMemoryStore) {}

  async run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    const snapshot = this.store.snapshot()
    try {
      return await work(buildTransactionalRepositories(this.store))
    } catch (error) {
      this.store.restoreFrom(snapshot)
      throw error
    }
  }
}

export function buildTransactionalRepositories(store: InMemoryStore): TransactionalRepositories {
  return {
    patients: createPatientRepository(store),
    affiliations: createAffiliationRepository(store),
    episodes: createEpisodeRepository(store),
    careServices: createCareServiceRepository(store),
    authorizations: createAuthorizationRepository(store),
  }
}

export function createPatientRepository(store: InMemoryStore): IPatientRepository {
  return {
    async findById(id) {
      return store.patients.find((patient) => patient.id === id && patient.deletedAt === null) ?? null
    },
    async search() {
      return notImplemented('IPatientRepository.search')
    },
    async create(patient) {
      const created: Patient = { id: nextId('patient'), ...patient, ...stamps() }
      store.patients.push(created)
      return created
    },
    async update() {
      return notImplemented('IPatientRepository.update')
    },
    async softDelete() {
      return notImplemented('IPatientRepository.softDelete')
    },
    async listContacts(patientId) {
      return store.contacts.filter(
        (contact) => contact.patientId === patientId && contact.deletedAt === null,
      )
    },
    async addContact(contact) {
      const created: PatientContact = { id: nextId('contact'), ...contact, ...stamps() }
      store.contacts.push(created)
      return created
    },
    async setPrimaryContact() {
      return notImplemented('IPatientRepository.setPrimaryContact')
    },
  }
}

export function createAffiliationRepository(store: InMemoryStore): IAffiliationRepository {
  const live = (): Affiliation[] => store.affiliations.filter((row) => row.deletedAt === null)

  return {
    async findById(id) {
      return live().find((affiliation) => affiliation.id === id) ?? null
    },
    async findCurrentByMemberNumber(insuranceProviderId, memberNumber) {
      return (
        live().find(
          (affiliation) =>
            affiliation.to === null &&
            affiliation.insuranceProviderId === insuranceProviderId &&
            affiliation.memberNumber === memberNumber,
        ) ?? null
      )
    },
    async listByPatient(patientId) {
      return live()
        .filter((affiliation) => affiliation.patientId === patientId)
        .sort((a, b) => b.from.getTime() - a.from.getTime())
    },
    async findCurrentByPatient(patientId) {
      return (
        live().find(
          (affiliation) => affiliation.patientId === patientId && affiliation.to === null,
        ) ?? null
      )
    },
    async create(affiliation) {
      const created: Affiliation = {
        id: nextId('affiliation'),
        ...affiliation,
        to: null,
        ...stamps(),
      }
      store.affiliations.push(created)
      return created
    },
    async close(id, to) {
      const index = store.affiliations.findIndex((affiliation) => affiliation.id === id)
      const found = store.affiliations[index]
      if (found === undefined) throw new Error('Afiliación inexistente')

      const updated: Affiliation = { ...found, to }
      store.affiliations[index] = updated
      return updated
    },
    async softDelete(id) {
      const index = store.affiliations.findIndex((affiliation) => affiliation.id === id)
      const found = store.affiliations[index]
      if (found === undefined) throw new Error('Afiliación inexistente')

      store.affiliations[index] = { ...found, deletedAt: new Date() }
    },
  }
}

export function createEpisodeRepository(store: InMemoryStore): IHomeCareEpisodeRepository {
  const live = (): HomeCareEpisode[] => store.episodes.filter((row) => row.deletedAt === null)

  return {
    async findById(id) {
      return live().find((episode) => episode.id === id) ?? null
    },
    async listByPatient(patientId) {
      return live()
        .filter((episode) => episode.patientId === patientId)
        .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())
    },
    async findOpenByPatient(patientId) {
      return (
        live().find((episode) => episode.patientId === patientId && episode.endsOn === null) ?? null
      )
    },
    async create(episode) {
      const created: HomeCareEpisode = {
        id: nextId('episode'),
        ...episode,
        endsOn: null,
        closeReason: null,
        closeNote: null,
        ...stamps(),
      }
      store.episodes.push(created)
      return created
    },
    async close(id, input) {
      const index = store.episodes.findIndex((episode) => episode.id === id)
      const found = store.episodes[index]
      if (found === undefined) throw new Error('Episodio inexistente')

      const updated: HomeCareEpisode = {
        ...found,
        endsOn: input.endsOn,
        closeReason: input.closeReason,
        closeNote: input.closeNote ?? null,
      }
      store.episodes[index] = updated
      return updated
    },
    async listOpenStartedAt() {
      return notImplemented('IHomeCareEpisodeRepository.listOpenStartedAt')
    },
    async listPendingByCloseReason() {
      return notImplemented('IHomeCareEpisodeRepository.listPendingByCloseReason')
    },
  }
}

export function createCareServiceRepository(store: InMemoryStore): ICareServiceRepository {
  const live = (): CareService[] => store.careServices.filter((row) => row.deletedAt === null)

  return {
    async findById(id) {
      return live().find((careService) => careService.id === id) ?? null
    },
    async listByEpisode(episodeId) {
      return live().filter((careService) => careService.episodeId === episodeId)
    },
    async listActiveWithAuthorizations() {
      return notImplemented('ICareServiceRepository.listActiveWithAuthorizations')
    },
    async create(careService) {
      const created: CareService = {
        id: nextId('care-service'),
        ...careService,
        endedOn: null,
        ...stamps(),
      }
      store.careServices.push(created)
      return created
    },
    async createGuarded(input) {
      const careService = await this.create(input.careService)
      return { careService, failure: null }
    },
    async assignProfessional(id, professionalId) {
      const index = store.careServices.findIndex((careService) => careService.id === id)
      const found = store.careServices[index]
      if (found === undefined || found.deletedAt !== null || found.endedOn !== null) return null

      const updated: CareService = { ...found, professionalId }
      store.careServices[index] = updated
      return updated
    },
    async end(id, endedOn) {
      const index = store.careServices.findIndex((careService) => careService.id === id)
      const found = store.careServices[index]
      if (found === undefined || found.deletedAt !== null || found.endedOn !== null) return null

      const updated: CareService = { ...found, endedOn }
      store.careServices[index] = updated
      return updated
    },
    async listInsuranceProviderIdsForCompany(contractingCompanyId) {
      return store.companyProviders
        .filter((link) => link.contractingCompanyId === contractingCompanyId)
        .map((link) => link.insuranceProviderId)
    },
  }
}

export function createAuthorizationRepository(store: InMemoryStore): IAuthorizationRepository {
  const live = (): Authorization[] => store.authorizations.filter((row) => row.deletedAt === null)

  return {
    async findById(id) {
      return live().find((authorization) => authorization.id === id) ?? null
    },
    async listByCareService(careServiceId) {
      return live()
        .filter((authorization) => authorization.careServiceId === careServiceId)
        .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())
    },
    async create(authorization) {
      const created: Authorization = {
        id: nextId('authorization'),
        ...authorization,
        claimedAt: null,
        ...stamps(),
      }
      store.authorizations.push(created)
      return created
    },
    async createGuarded(input) {
      const careService = store.careServices.find((candidate) => candidate.id === input.careServiceId)
      if (careService === undefined) {
        return { authorization: null, failure: AuthorizationCreateFailure.CARE_SERVICE_NOT_FOUND }
      }
      if (careService.endedOn !== null || careService.deletedAt !== null) {
        return { authorization: null, failure: AuthorizationCreateFailure.CARE_SERVICE_ENDED }
      }

      const episode = store.episodes.find((candidate) => candidate.id === careService.episodeId)
      if (episode === undefined) {
        return { authorization: null, failure: AuthorizationCreateFailure.EPISODE_NOT_FOUND }
      }
      if (episode.endsOn !== null || episode.deletedAt !== null) {
        return { authorization: null, failure: AuthorizationCreateFailure.EPISODE_CLOSED }
      }

      const frequency = store.frequencies.find((candidate) => candidate.id === input.frequencyId)
      if (frequency === undefined || frequency.deletedAt !== null) {
        return { authorization: null, failure: AuthorizationCreateFailure.FREQUENCY_NOT_FOUND }
      }
      if (!frequency.active) {
        return { authorization: null, failure: AuthorizationCreateFailure.FREQUENCY_INACTIVE }
      }

      const eligible = store.specialtyFrequencies.some(
        (relationship) =>
          relationship.specialtyId === careService.specialtyId &&
          relationship.frequencyId === frequency.id,
      )
      if (!eligible) {
        return { authorization: null, failure: AuthorizationCreateFailure.FREQUENCY_NOT_ELIGIBLE }
      }
      if (input.validUntil.getTime() < input.validFrom.getTime()) {
        return { authorization: null, failure: AuthorizationCreateFailure.INVALID_PERIOD }
      }

      const authorization = await this.create({
        ...input,
        frequencyAmount: frequency.amount,
        frequencyUnit: frequency.unit,
      })
      return { authorization, failure: null }
    },
    async markClaimed(id, claimedAt) {
      const index = store.authorizations.findIndex((authorization) => authorization.id === id)
      const found = store.authorizations[index]
      if (found === undefined) throw new Error('Autorización inexistente')

      const updated: Authorization = { ...found, claimedAt }
      store.authorizations[index] = updated
      return updated
    },
  }
}

export function createSpecialtyRepository(store: InMemoryStore): ISpecialtyRepository {
  return {
    async findById(id) {
      return store.specialties.find((specialty) => specialty.id === id) ?? null
    },
    async listActive() {
      return store.specialties.filter((specialty) => specialty.active)
    },
    async create() {
      return notImplemented('ISpecialtyRepository.create')
    },
    async update() {
      return notImplemented('ISpecialtyRepository.update')
    },
    async deactivate() {
      return notImplemented('ISpecialtyRepository.deactivate')
    },
  }
}

export function createFrequencyRepository(store: InMemoryStore): IFrequencyRepository {
  return {
    async findById(id) {
      return store.frequencies.find((frequency) => frequency.id === id) ?? null
    },
    async listActive() {
      return store.frequencies.filter((frequency) => frequency.active)
    },
    async listEligibleForSpecialty(specialtyId) {
      const ids = store.specialtyFrequencies
        .filter((link) => link.specialtyId === specialtyId)
        .map((link) => link.frequencyId)

      return store.frequencies.filter((frequency) => ids.includes(frequency.id))
    },
    async create() {
      return notImplemented('IFrequencyRepository.create')
    },
    async deactivate() {
      return notImplemented('IFrequencyRepository.deactivate')
    },
    async linkToSpecialty() {
      return notImplemented('IFrequencyRepository.linkToSpecialty')
    },
    async unlinkFromSpecialty() {
      return notImplemented('IFrequencyRepository.unlinkFromSpecialty')
    },
  }
}

export function createProfessionalRepository(store: InMemoryStore): IProfessionalRepository {
  return {
    async findById(id) {
      return store.professionals.find((professional) => professional.id === id) ?? null
    },
    async listActive() {
      return store.professionals.filter((professional) => professional.active)
    },
    async listActiveBySpecialty(specialtyId) {
      const ids = store.professionalSpecialties
        .filter((link) => link.specialtyId === specialtyId)
        .map((link) => link.professionalId)

      return store.professionals.filter(
        (professional) => professional.active && ids.includes(professional.id),
      )
    },
    async listSpecialtyIds(professionalId) {
      return store.professionalSpecialties
        .filter((link) => link.professionalId === professionalId)
        .map((link) => link.specialtyId)
    },
    async create() {
      return notImplemented('IProfessionalRepository.create')
    },
    async update() {
      return notImplemented('IProfessionalRepository.update')
    },
    async setSpecialties() {
      return notImplemented('IProfessionalRepository.setSpecialties')
    },
  }
}

export function createContractingCompanyRepository(
  store: InMemoryStore,
): IContractingCompanyRepository {
  return {
    async findById(id) {
      return store.companies.find((company) => company.id === id) ?? null
    },
    async listActive() {
      return store.companies.filter((company) => company.active)
    },
    async listActiveByInsuranceProvider(insuranceProviderId) {
      const ids = store.companyProviders
        .filter((link) => link.insuranceProviderId === insuranceProviderId)
        .map((link) => link.contractingCompanyId)

      return store.companies.filter((company) => company.active && ids.includes(company.id))
    },
    async create() {
      return notImplemented('IContractingCompanyRepository.create')
    },
    async setInsuranceProviders() {
      return notImplemented('IContractingCompanyRepository.setInsuranceProviders')
    },
  }
}

export function createInsuranceProviderRepository(
  store: InMemoryStore,
): IInsuranceProviderRepository {
  return {
    async findById(id) {
      return store.providers.find((provider) => provider.id === id) ?? null
    },
    async listActive() {
      return store.providers.filter((provider) => provider.active)
    },
    async listReachable() {
      const ids = store.companyProviders.map((link) => link.insuranceProviderId)
      return store.providers.filter((provider) => ids.includes(provider.id))
    },
    async create() {
      return notImplemented('IInsuranceProviderRepository.create')
    },
  }
}

export function createLocalityRepository(store: InMemoryStore): ILocalityRepository {
  return {
    async findById(id) {
      return store.localities.find((locality) => locality.id === id) ?? null
    },
    async listProvinces() {
      return notImplemented('ILocalityRepository.listProvinces')
    },
    async listByProvince() {
      return notImplemented('ILocalityRepository.listByProvince')
    },
    async search() {
      return notImplemented('ILocalityRepository.search')
    },
  }
}

/** Arma las filas del dashboard cruzando el store, como haria el SQL real. */
export function createDashboardQuery(store: InMemoryStore): IDashboardQuery {
  function openStartedEpisodeIds(asOf: Date): string[] {
    return store.episodes
      .filter(
        (episode) =>
          episode.deletedAt === null &&
          episode.endsOn === null &&
          episode.startsOn.getTime() <= asOf.getTime(),
      )
      .map((episode) => episode.id)
  }

  return {
    async listActiveCareServices(asOf) {
      const episodeIds = openStartedEpisodeIds(asOf)

      return store.careServices
        .filter(
          (careService) =>
            careService.deletedAt === null &&
            careService.endedOn === null &&
            episodeIds.includes(careService.episodeId),
        )
        .map((careService): ActiveCareServiceRow => {
          const episode = store.episodes.find((row) => row.id === careService.episodeId)
          const patient = store.patients.find((row) => row.id === episode?.patientId)
          const specialty = store.specialties.find((row) => row.id === careService.specialtyId)
          const company = store.companies.find(
            (row) => row.id === careService.contractingCompanyId,
          )
          const professional = store.professionals.find(
            (row) => row.id === careService.professionalId,
          )

          return {
            careServiceId: careService.id,
            episodeId: careService.episodeId,
            patientId: patient?.id ?? '',
            patientLastName: patient?.lastName ?? '',
            patientFirstName: patient?.firstName ?? '',
            specialtyId: careService.specialtyId,
            specialtyName: specialty?.name ?? '',
            serviceUnit: specialty?.serviceUnit ?? 'VISITA',
            contractingCompanyId: careService.contractingCompanyId,
            contractingCompanyName: company?.name ?? '',
            professionalId: careService.professionalId,
            professionalLastName: professional?.lastName ?? null,
            professionalFirstName: professional?.firstName ?? null,
            authorizations: store.authorizations.filter(
              (authorization) =>
                authorization.deletedAt === null &&
                authorization.careServiceId === careService.id,
            ),
          }
        })
    },

    async countActivePatients(asOf) {
      const episodeIds = new Set(openStartedEpisodeIds(asOf))

      return new Set(
        store.episodes
          .filter((episode) => episodeIds.has(episode.id))
          .map((episode) => episode.patientId),
      ).size
    },

    async listPendingEpisodes(asOf) {
      const rows: PendingEpisodeRow[] = []

      for (const patient of store.patients) {
        const episodes = store.episodes
          .filter(
            (episode) => episode.deletedAt === null && episode.patientId === patient.id,
          )
          .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())

        const last = episodes.at(-1)
        if (last === undefined || last.endsOn === null || last.closeReason === null) continue
        if (last.endsOn.getTime() > asOf.getTime()) continue

        rows.push({
          episodeId: last.id,
          patientId: patient.id,
          patientLastName: patient.lastName,
          patientFirstName: patient.firstName,
          endsOn: last.endsOn,
          closeReason: last.closeReason,
          closeNote: last.closeNote,
        })
      }

      return rows
    },
  }
}

/** Datos minimos y coherentes para no repetir el mismo armado en cada test. */
export function seedCatalog(store: InMemoryStore): {
  providerId: string
  companyId: string
  specialtyId: string
  frequencyId: string
  professionalId: string
  localityId: string
} {
  const provider: InsuranceProvider = {
    id: 'provider-swiss',
    name: 'Swiss Medical',
    active: true,
    ...stamps(),
  }
  const company: ContractingCompany = {
    id: 'company-sanitycare',
    name: 'SanityCare',
    active: true,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    ...stamps(),
  }
  const specialty: Specialty = {
    id: 'specialty-kinesio',
    name: 'Kinesiología Motora',
    serviceUnit: 'SESION',
    active: true,
    ...stamps(),
  }
  const frequency: Frequency = {
    id: 'frequency-2-semanal',
    amount: 2,
    unit: 'SEMANAL',
    active: true,
    ...stamps(),
  }
  const professional: Professional = {
    id: 'professional-yolanda',
    lastName: 'Gómez',
    firstName: 'Yolanda',
    documentNumber: null,
    licenseNumber: null,
    phone: null,
    email: null,
    taxId: null,
    bankAccount: null,
    bankAlias: null,
    active: true,
    ...stamps(),
  }
  const locality: Locality = {
    id: 'locality-caballito',
    provinceId: 'province-caba',
    name: 'Caballito',
    postalCode: null,
    ...stamps(),
  }

  store.providers.push(provider)
  store.companies.push(company)
  store.specialties.push(specialty)
  store.frequencies.push(frequency)
  store.professionals.push(professional)
  store.localities.push(locality)
  store.companyProviders.push({
    contractingCompanyId: company.id,
    insuranceProviderId: provider.id,
  })
  store.specialtyFrequencies.push({
    specialtyId: specialty.id,
    frequencyId: frequency.id,
  })
  store.professionalSpecialties.push({
    professionalId: professional.id,
    specialtyId: specialty.id,
  })

  return {
    providerId: provider.id,
    companyId: company.id,
    specialtyId: specialty.id,
    frequencyId: frequency.id,
    professionalId: professional.id,
    localityId: locality.id,
  }
}
