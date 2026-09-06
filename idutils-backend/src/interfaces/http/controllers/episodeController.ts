import type { Request, RequestHandler, Response } from 'express'
import { CloseEpisodeUseCase } from '../../../application/useCases/episode/closeEpisodeUseCase.js'
import { OpenEpisodeUseCase } from '../../../application/useCases/episode/openEpisodeUseCase.js'
import { SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { sendCreated, sendOk } from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'
import { idParamsSchema } from '../schemas/commonSchemas.js'
import { closeEpisodeSchema, openEpisodeSchema } from '../schemas/episodeSchemas.js'

export function createEpisodeController(dependencies: HttpDependencies): {
  open: RequestHandler
  close: RequestHandler
} {
  const { infrastructure } = dependencies

  const openUseCase = new OpenEpisodeUseCase(
    infrastructure.unitOfWork,
    infrastructure.professionals,
    infrastructure.frequencies,
  )

  const closeUseCase = new CloseEpisodeUseCase(infrastructure.episodes)

  return {
    /**
     * Abre el episodio CON sus prestaciones, en una transaccion.
     *
     * Van juntos porque son el mismo movimiento del negocio. Cortado a la
     * mitad quedaria un episodio abierto con prestaciones incompletas, y el
     * dashboard lo mostraria como trabajo pendiente sin que nadie haya hecho
     * nada mal.
     */
    open: async (request: Request, response: Response): Promise<void> => {
      const command = openEpisodeSchema.parse(request.body)
      const result = await openUseCase.execute(command)

      sendCreated(response, SUCCESS_MESSAGES.EPISODE.OPENED, result)
    },

    /**
     * Devuelve la bandeja resultante, no solo un OK.
     *
     * Es para que la pantalla pueda decir "queda en Esperando alta" en el mismo
     * momento en que el operador cierra, y no lo descubra tres dias despues
     * mirando una lista.
     */
    close: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const body = closeEpisodeSchema.parse(request.body)

      const result = await closeUseCase.execute({ episodeId: id, ...body })

      sendOk(response, SUCCESS_MESSAGES.EPISODE.CLOSED, result)
    },
  }
}
