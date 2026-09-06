import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type { IProfessionalRepository } from '../../../domain/repositories/ICatalogRepository.js'
import { validateCareServiceMutation } from '../../../domain/services/careServiceRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { assertNoViolations } from '../../../shared/errors/assertNoViolations.js'

export class AssignCareServiceProfessionalUseCase {
  constructor(
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly professionalRepository: IProfessionalRepository,
  ) {}

  async execute(careServiceId: string, professionalId: string | null) {
    const careService = await this.careServiceRepository.findById(careServiceId)
    if (careService === null) throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.NOT_FOUND)

    const episode = await this.episodeRepository.findById(careService.episodeId)
    if (episode === null) throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)

    assertNoViolations(
      validateCareServiceMutation({
        serviceEndedOn: careService.endedOn,
        serviceDeletedAt: careService.deletedAt,
        episodeEndsOn: episode.endsOn,
        episodeDeletedAt: episode.deletedAt,
      }),
      ERROR_MESSAGES.CARE_SERVICE,
    )

    if (professionalId !== null) {
      const professional = await this.professionalRepository.findById(professionalId)
      if (professional === null || professional.deletedAt !== null) {
        throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND)
      }
      if (!professional.active) {
        throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE)
      }

      const specialtyIds = await this.professionalRepository.listSpecialtyIds(professional.id)
      if (!specialtyIds.includes(careService.specialtyId)) {
        throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.PROFESIONAL_SIN_ESPECIALIDAD)
      }
    }

    const updated = await this.careServiceRepository.assignProfessional(
      careService.id,
      professionalId,
      careService.specialtyId,
    )
    if (updated === null) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.NOT_MUTABLE)
    }

    return updated
  }
}
