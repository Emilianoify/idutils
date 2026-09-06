import type { IAffiliationRepository } from './IAffiliationRepository.js'
import type { IAuthorizationRepository } from './IAuthorizationRepository.js'
import type { ICareServiceRepository } from './ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from './IHomeCareEpisodeRepository.js'
import type { IPatientRepository } from './IPatientRepository.js'

/**
 * Los repositorios que participan de una misma transaccion.
 *
 * Son los cinco que se escriben juntos. Los catalogos no estan: se leen para
 * validar, no se modifican en el mismo movimiento.
 */
export interface TransactionalRepositories {
  patients: IPatientRepository
  affiliations: IAffiliationRepository
  episodes: IHomeCareEpisodeRepository
  careServices: ICareServiceRepository
  authorizations: IAuthorizationRepository
}

/**
 * Transaccion, como puerto del dominio.
 *
 * Hay tres movimientos del negocio que son un solo hecho y no pueden quedar a
 * medias:
 *
 *  - alta de paciente = paciente + afiliacion (+ contacto). A medias queda un
 *    paciente sin cobertura que despues nadie sabe de donde salio.
 *  - cambio de obra social = cerrar afiliacion + cerrar episodio (D9). A medias
 *    queda un episodio abierto colgado de una afiliacion cerrada, que es un
 *    estado que el modelo declara imposible.
 *  - alta de prestacion con autorizacion = prestacion + autorizacion. A medias
 *    queda una prestacion SIN_AUTORIZACION que el dashboard va a mostrar como
 *    trabajo pendiente sin que nadie haya hecho nada mal.
 *
 * El puerto vive en el dominio y la implementacion en infraestructura, asi el
 * caso de uso no sabe que existe Prisma.
 */
export interface IUnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>
}
