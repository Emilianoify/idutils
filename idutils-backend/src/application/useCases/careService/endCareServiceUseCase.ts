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
  ) {}

  async execute(careServiceId: string, endedOn: Date) {
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
      }),
      ERROR_MESSAGES.CARE_SERVICE,
    )

    const updated = await this.careServiceRepository.end(careService.id, endedOn)
    if (updated === null) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.NOT_MUTABLE)
    }

    return updated
  }
}
