import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { CareServiceTimeline } from '../../dto/authorizationDto.js'
import type { GetCareServiceTimelineUseCase } from '../authorization/getCareServiceTimelineUseCase.js'

/**
 * Las prestaciones de un episodio, cada una con su cobertura ya derivada.
 *
 * Devuelve la MISMA forma que la linea de tiempo de una sola prestacion, y se
 * apoya en el mismo caso de uso. Una consulta aparte que armara un resumen
 * distinto seria una segunda forma de leer el mismo hecho, y el dia que cambie
 * `coverageAt` habria que acordarse de las dos.
 *
 * Son varias consultas por prestacion, y esta bien: una coordinacion no tiene
 * un problema de volumen, tiene un problema de memoria (D0). Un episodio lleva
 * un puñado de prestaciones, no diez mil.
 */
export class ListEpisodeCareServicesUseCase {
  constructor(
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly timelineUseCase: GetCareServiceTimelineUseCase,
  ) {}

  async execute(episodeId: string): Promise<CareServiceTimeline[]> {
    const episode = await this.episodeRepository.findById(episodeId)
    if (episode === null) {
      throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)
    }

    const careServices = await this.careServiceRepository.listByEpisode(episodeId)

    return Promise.all(
      careServices.map((careService) => this.timelineUseCase.execute(careService.id)),
    )
  }
}
