import type { IAuthorizationRepository } from '../../../domain/repositories/IAuthorizationRepository.js'
import type { IClock } from '../../../domain/repositories/IClock.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Registra que se reclamo la renovacion de una autorizacion.
 *
 * Reclamar NO es autorizar. Esta operacion no crea nada ni extiende ningun
 * periodo: solo deja constancia de que se pidio. La autorizacion nueva nace
 * cuando la empresa la otorga, con `CreateAuthorizationUseCase`.
 *
 * Confundir las dos es como el sistema termina diciendo que algo esta
 * autorizado porque alguien mando un WhatsApp.
 *
 * Efecto practico: la prestacion sale de la lista de reclamos pendientes
 * (`needsClaim`) pero sigue POR_VENCER. Reclamar dos veces es ruido, y el ruido
 * es lo que hace que la gente deje de mirar la lista.
 */
export class ClaimAuthorizationUseCase {
  constructor(
    private readonly authorizationRepository: IAuthorizationRepository,
    private readonly clock: IClock,
  ) {}

  async execute(authorizationId: string): Promise<{ claimedAt: Date }> {
    const authorization = await this.authorizationRepository.findById(authorizationId)
    if (authorization === null) {
      throw new AppError(404, ERROR_MESSAGES.AUTHORIZATION.NOT_FOUND)
    }

    if (authorization.claimedAt !== null) {
      throw new AppError(409, ERROR_MESSAGES.AUTHORIZATION.ALREADY_CLAIMED)
    }

    const claimedAt = this.clock.today()
    await this.authorizationRepository.markClaimed(authorization.id, claimedAt)

    return { claimedAt }
  }
}
