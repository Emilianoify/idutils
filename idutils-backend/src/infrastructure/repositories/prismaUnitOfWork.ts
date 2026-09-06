import type { PrismaClient } from '../../generated/prisma/client.js'
import type { IUnitOfWork, TransactionalRepositories } from '../../domain/repositories/IUnitOfWork.js'
import { createTransactionContext } from '../database/prismaContext.js'
import { withDomainErrors } from '../database/prismaErrors.js'
import { createPrismaAffiliationRepository } from './prismaAffiliationRepository.js'
import { createPrismaAuthorizationRepository } from './prismaAuthorizationRepository.js'
import { createPrismaCareServiceRepository } from './prismaCareServiceRepository.js'
import { createPrismaHomeCareEpisodeRepository } from './prismaHomeCareEpisodeRepository.js'
import { createPrismaPatientRepository } from './prismaPatientRepository.js'

/**
 * La transaccion de Prisma detras del puerto del dominio.
 *
 * Los cinco repositorios se construyen ADENTRO del callback, sobre el cliente
 * de la transaccion. Es el punto entero: si se construyeran afuera, sobre el
 * cliente raiz, cada escritura iria por su propia conexion y la transaccion no
 * envolveria nada. Compilaria igual, pasaria los tests con fakes igual, y en
 * produccion dejaria pacientes sin afiliacion el dia que falle el segundo
 * INSERT.
 *
 * El caso de uso nunca ve esto: recibe `TransactionalRepositories` y no sabe
 * que existe Prisma.
 */
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(private readonly client: PrismaClient) {}

  async run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    return withDomainErrors(() =>
      this.client.$transaction(async (transaction) => {
        const context = createTransactionContext(transaction)

        return work({
          patients: createPrismaPatientRepository(context),
          affiliations: createPrismaAffiliationRepository(context),
          episodes: createPrismaHomeCareEpisodeRepository(context),
          careServices: createPrismaCareServiceRepository(context),
          authorizations: createPrismaAuthorizationRepository(context),
        })
      }),
    )
  }
}
