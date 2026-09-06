import {
  AuthorizationCreateFailure,
  type AuthorizationCreateFailure as AuthorizationCreateFailureType,
} from '../../../domain/repositories/IAuthorizationRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

export function throwAuthorizationCreateFailure(
  failure: AuthorizationCreateFailureType,
): never {
  switch (failure) {
    case AuthorizationCreateFailure.CARE_SERVICE_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.NOT_FOUND)
    case AuthorizationCreateFailure.CARE_SERVICE_ENDED:
    case AuthorizationCreateFailure.EPISODE_NOT_FOUND:
    case AuthorizationCreateFailure.EPISODE_CLOSED:
      throw new AppError(409, ERROR_MESSAGES.AUTHORIZATION.PRESTACION_DADA_DE_BAJA)
    case AuthorizationCreateFailure.FREQUENCY_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.AUTHORIZATION.FREQUENCY_NOT_FOUND)
    case AuthorizationCreateFailure.FREQUENCY_INACTIVE:
      throw new AppError(409, ERROR_MESSAGES.AUTHORIZATION.FRECUENCIA_INACTIVA)
    case AuthorizationCreateFailure.FREQUENCY_NOT_ELIGIBLE:
      throw new AppError(409, ERROR_MESSAGES.AUTHORIZATION.FRECUENCIA_NO_ELEGIBLE)
    case AuthorizationCreateFailure.INVALID_PERIOD:
      throw new AppError(400, ERROR_MESSAGES.AUTHORIZATION.PERIODO_INVALIDO)
  }
}
