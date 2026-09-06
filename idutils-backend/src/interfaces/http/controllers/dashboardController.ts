import type { Request, RequestHandler, Response } from 'express'
import { GetDashboardUseCase } from '../../../application/useCases/dashboard/getDashboardUseCase.js'
import { DEFAULT_EXPIRY_WARNING_DAYS } from '../../../domain/enums/authorizationStatus.js'
import { SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { sendOk } from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'

/**
 * El dashboard v1: el operador entra y ve cuantas hay por vencer.
 *
 * Es UN endpoint y no cinco. La pantalla necesita los contadores, el corte por
 * empresa, los reclamos y las bandejas AL MISMO tiempo y a la MISMA fecha; con
 * cinco llamadas, dos podrian caer a distinto lado de la medianoche y los
 * numeros no cerrarian entre si.
 */
export function createDashboardController(dependencies: HttpDependencies): {
  get: RequestHandler
} {
  const useCase = new GetDashboardUseCase(
    dependencies.infrastructure.dashboard,
    dependencies.infrastructure.clock,
    // El umbral lo administra la coordinacion. Hasta que haya pantalla de
    // configuracion, el default del dominio: lo que tarda una empresa en
    // renovar cuando se le reclama a tiempo.
    DEFAULT_EXPIRY_WARNING_DAYS,
  )

  return {
    get: async (_request: Request, response: Response): Promise<void> => {
      sendOk(response, SUCCESS_MESSAGES.DASHBOARD.SUMMARY, await useCase.execute())
    },
  }
}
