import {
  CareServiceCreateFailure,
  type CareServiceCreateFailure as CareServiceCreateFailureType,
} from '../../../domain/repositories/ICareServiceRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

export function throwCareServiceCreateFailure(failure: CareServiceCreateFailureType): never {
  switch (failure) {
    case CareServiceCreateFailure.EPISODE_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)
    case CareServiceCreateFailure.EPISODE_CLOSED:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.EPISODIO_CERRADO)
    case CareServiceCreateFailure.AFFILIATION_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.AFFILIATION.NOT_FOUND)
    case CareServiceCreateFailure.AFFILIATION_NOT_CURRENT:
      throw new AppError(409, ERROR_MESSAGES.EPISODE.AFFILIATION_NOT_CURRENT)
    case CareServiceCreateFailure.SPECIALTY_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND)
    case CareServiceCreateFailure.SPECIALTY_INACTIVE:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE)
    case CareServiceCreateFailure.COMPANY_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND)
    case CareServiceCreateFailure.COMPANY_INACTIVE:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.COMPANY_INACTIVE)
    case CareServiceCreateFailure.PROFESSIONAL_NOT_FOUND:
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND)
    case CareServiceCreateFailure.PROFESSIONAL_INACTIVE:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE)
    case CareServiceCreateFailure.COMPANY_PROVIDER_MISSING:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.EMPRESA_SIN_CONVENIO)
    case CareServiceCreateFailure.PROFESSIONAL_SPECIALTY_MISSING:
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD)
  }
}
