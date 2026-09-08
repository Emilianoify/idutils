import type { IClock } from '../../../domain/repositories/IClock.js'
import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import { validateCareServiceEnd } from '../../../domain/services/careServiceRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { assertNoViolations } from '../../../shared/errors/assertNoViolations.js'

export class EndCareServiceUseCase {
  constructor(
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly clock: IClock,
  ) {}

  async execute(careServiceId: string, endedOn: Date) {
    // `asOf` decide si el episodio sigue corriendo; `endedOn` es la fecha civil
    // de la baja. Son dos cosas distintas y el operador puede elegir la segunda.
    const asOf = this.clock.today()

    const careService = await this.careServiceRepository.findById(careServiceId)
    if (careService === null) throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.NOT_FOUND)

    const episode = await this.episodeRepository.findById(careService.episodeId)
    if (episode === null) throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)

    assertNoViolations(
      validateCareServiceEnd({
        serviceEndedOn: careService.endedOn,
        serviceDeletedAt: careService.deletedAt,
        episodeStartsOn: episode.startsOn,
        episodeEndsOn: episode.endsOn,
        episodeDeletedAt: episode.deletedAt,
        endedOn,
        asOf,
      }),
      ERROR_MESSAGES.CARE_SERVICE,
    )

    const updated = await this.careServiceRepository.end(careService.id, endedOn, asOf)
    if (updated === null) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.NOT_MUTABLE)
    }

    return updated
  }
}
