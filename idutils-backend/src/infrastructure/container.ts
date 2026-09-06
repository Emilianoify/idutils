import type { PrismaClient } from '../generated/prisma/client.js'
import type { IAffiliationRepository } from '../domain/repositories/IAffiliationRepository.js'
import type { IAuthorizationRepository } from '../domain/repositories/IAuthorizationRepository.js'
import type { ICareServiceRepository } from '../domain/repositories/ICareServiceRepository.js'
import type {
  IContractingCompanyRepository,
  IFrequencyRepository,
  IInsuranceProviderRepository,
  ILocalityRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../domain/repositories/ICatalogRepository.js'
import type { IClock } from '../domain/repositories/IClock.js'
import type { IDashboardQuery } from '../domain/repositories/IDashboardQuery.js'
import type { IHomeCareEpisodeRepository } from '../domain/repositories/IHomeCareEpisodeRepository.js'
import type { IPatientRepository } from '../domain/repositories/IPatientRepository.js'
import type { IRefreshSessionRepository } from '../domain/repositories/IRefreshSessionRepository.js'
import type { IUnitOfWork } from '../domain/repositories/IUnitOfWork.js'
import type { IUserRepository } from '../domain/repositories/IUserRepository.js'
import { SystemClock } from './clock/systemClock.js'
import { createRootContext } from './database/prismaContext.js'
import { createPrismaAffiliationRepository } from './repositories/prismaAffiliationRepository.js'
import { createPrismaAuthorizationRepository } from './repositories/prismaAuthorizationRepository.js'
import { createPrismaCareServiceRepository } from './repositories/prismaCareServiceRepository.js'
import {
  createPrismaContractingCompanyRepository,
  createPrismaFrequencyRepository,
  createPrismaInsuranceProviderRepository,
  createPrismaLocalityRepository,
  createPrismaProfessionalRepository,
  createPrismaSpecialtyRepository,
} from './repositories/prismaCatalogRepositories.js'
import { createPrismaDashboardQuery } from './repositories/prismaDashboardQuery.js'
import { createPrismaHomeCareEpisodeRepository } from './repositories/prismaHomeCareEpisodeRepository.js'
import { createPrismaPatientRepository } from './repositories/prismaPatientRepository.js'
import { createPrismaRefreshSessionRepository } from './repositories/prismaRefreshSessionRepository.js'
import { PrismaUnitOfWork } from './repositories/prismaUnitOfWork.js'
import { createPrismaUserRepository } from './repositories/prismaUserRepository.js'

/**
 * Todos los adaptadores que la aplicacion necesita, ya construidos.
 *
 * El tipo esta escrito con los PUERTOS del dominio y no con las clases de
 * Prisma a proposito: quien recibe esto no puede llamar a nada que el dominio
 * no haya declarado. El dia que haya un segundo adaptador —un import, un
 * cache— entra por aca sin tocar un caso de uso.
 */
export interface Infrastructure {
  clock: IClock
  unitOfWork: IUnitOfWork
  patients: IPatientRepository
  affiliations: IAffiliationRepository
  episodes: IHomeCareEpisodeRepository
  careServices: ICareServiceRepository
  authorizations: IAuthorizationRepository
  specialties: ISpecialtyRepository
  frequencies: IFrequencyRepository
  professionals: IProfessionalRepository
  contractingCompanies: IContractingCompanyRepository
  insuranceProviders: IInsuranceProviderRepository
  localities: ILocalityRepository
  users: IUserRepository
  refreshSessions: IRefreshSessionRepository
  dashboard: IDashboardQuery
}

/**
 * Arma la infraestructura sobre un cliente de Prisma ya construido.
 *
 * Recibe el cliente en vez de crearlo para que el que arranca el proceso siga
 * siendo el dueno de la conexion: es el unico que sabe cuando cerrarla.
 */
export function createInfrastructure(client: PrismaClient): Infrastructure {
  const context = createRootContext(client)

  return {
    clock: new SystemClock(),
    unitOfWork: new PrismaUnitOfWork(client),
    patients: createPrismaPatientRepository(context),
    affiliations: createPrismaAffiliationRepository(context),
    episodes: createPrismaHomeCareEpisodeRepository(context),
    careServices: createPrismaCareServiceRepository(context),
    authorizations: createPrismaAuthorizationRepository(context),
    specialties: createPrismaSpecialtyRepository(context),
    frequencies: createPrismaFrequencyRepository(context),
    professionals: createPrismaProfessionalRepository(context),
    contractingCompanies: createPrismaContractingCompanyRepository(context),
    insuranceProviders: createPrismaInsuranceProviderRepository(context),
    localities: createPrismaLocalityRepository(context),
    users: createPrismaUserRepository(context),
    refreshSessions: createPrismaRefreshSessionRepository(context),
    dashboard: createPrismaDashboardQuery(context),
  }
}
