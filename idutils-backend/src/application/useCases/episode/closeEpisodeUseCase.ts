import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import { workQueueForCloseReason } from '../../../domain/services/patientStatus.js'
import type { WorkQueue } from '../../../domain/enums/workQueue.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { CloseEpisodeCommand } from '../../dto/episodeDto.js'

/**
 * Cierra el episodio de internacion domiciliaria.
 *
 * El motivo de cierre NO es un dato de archivo: es lo que decide en que bandeja
 * cae el paciente. Por eso se devuelve la bandeja resultante, para que la
 * pantalla pueda decir "queda en Esperando alta" en el mismo momento en que el
 * operador cierra, y no lo descubra tres dias despues.
 *
 * Las prestaciones NO se dan de baja una por una: quedan colgadas del episodio
 * cerrado y salen del dashboard porque el episodio ya no esta abierto. Cerrar
 * el episodio es el hecho; el resto se deriva.
 */
export class CloseEpisodeUseCase {
  constructor(private readonly episodeRepository: IHomeCareEpisodeRepository) {}

  async execute(command: CloseEpisodeCommand): Promise<{ queue: WorkQueue }> {
    const episode = await this.episodeRepository.findById(command.episodeId)
    if (episode === null) throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)

    if (episode.endsOn !== null) {
      throw new AppError(409, ERROR_MESSAGES.EPISODE.ALREADY_CLOSED)
    }

    // El rango es semiabierto: cerrar el mismo dia que empezo daria un episodio
    // de cero dias, que no es un episodio.
    if (command.endsOn.getTime() <= episode.startsOn.getTime()) {
      throw new AppError(400, ERROR_MESSAGES.EPISODE.CLOSES_BEFORE_START)
    }

    await this.episodeRepository.close(episode.id, {
      endsOn: command.endsOn,
      closeReason: command.closeReason,
      ...(command.closeNote !== null ? { closeNote: command.closeNote } : {}),
    })

    return { queue: workQueueForCloseReason(command.closeReason) }
  }
}
