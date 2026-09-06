import type { IAffiliationRepository } from '../../../domain/repositories/IAffiliationRepository.js'
import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type {
  IContractingCompanyRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../../domain/repositories/ICatalogRepository.js'
import { validateCareServiceDraft } from '../../../domain/services/careServiceRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { assertNoViolations } from '../../../shared/errors/assertNoViolations.js'
import { throwCareServiceCreateFailure } from './throwCareServiceCreateFailure.js'

export interface CreateCareServiceCommand {
  episodeId: string
  specialtyId: string
  contractingCompanyId: string
  professionalId: string | null
}

/**
 * Agrega una prestacion a un episodio ya abierto.
 *
 * La validacion que importa es la de D2: no se puede cargar un paciente de una
 * obra social bajo una empresa que no tiene ese convenio. La obra social no
 * viene en el comando y no podria: sale de la afiliacion del episodio. Si
 * viniera de afuera, un cliente podria mandar la que le convenga y la regla se
 * evapora.
 */
export class CreateCareServiceUseCase {
  constructor(
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly affiliationRepository: IAffiliationRepository,
    private readonly specialtyRepository: ISpecialtyRepository,
    private readonly contractingCompanyRepository: IContractingCompanyRepository,
    private readonly professionalRepository: IProfessionalRepository,
  ) {}

  async execute(command: CreateCareServiceCommand): Promise<{ careServiceId: string }> {
    const episode = await this.episodeRepository.findById(command.episodeId)
    if (episode === null) throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)

    const affiliation = await this.affiliationRepository.findById(episode.affiliationId)
    if (affiliation === null) throw new AppError(404, ERROR_MESSAGES.AFFILIATION.NOT_FOUND)

    const specialty = await this.specialtyRepository.findById(command.specialtyId)
    if (specialty === null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND)
    }
    if (specialty.deletedAt !== null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_NOT_FOUND)
    }
    if (!specialty.active) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.SPECIALTY_INACTIVE)
    }

    const company = await this.contractingCompanyRepository.findById(command.contractingCompanyId)
    if (company === null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND)
    }
    if (company.deletedAt !== null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.COMPANY_NOT_FOUND)
    }
    if (!company.active) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.COMPANY_INACTIVE)
    }

    if (command.professionalId !== null) {
      const professional = await this.professionalRepository.findById(command.professionalId)
      if (professional === null) {
        throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND)
      }
      if (professional.deletedAt !== null) {
        throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_NOT_FOUND)
      }
      if (!professional.active) {
        throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.PROFESSIONAL_INACTIVE)
      }
    }

    const companyProviders =
      await this.careServiceRepository.listInsuranceProviderIdsForCompany(company.id)
    const professionalSpecialties =
      command.professionalId === null
        ? []
        : await this.professionalRepository.listSpecialtyIds(command.professionalId)

    assertNoViolations(
      validateCareServiceDraft({
        episodeEndsOn: episode.endsOn,
        episodeDeletedAt: episode.deletedAt,
        insuranceProviderId: affiliation.insuranceProviderId,
        contractingCompanyId: company.id,
        specialtyId: specialty.id,
        professionalId: command.professionalId,
        companyInsuranceProviderIds: companyProviders,
        professionalSpecialtyIds: professionalSpecialties,
      }),
      ERROR_MESSAGES.CARE_SERVICE,
    )

    // La base tiene el unique parcial sobre (episodio, especialidad, empresa)
    // entre las activas. Esto esta para el mensaje, no para la garantia.
    const existing = await this.careServiceRepository.listByEpisode(episode.id)
    const duplicated = existing.some(
      (careService) =>
        careService.deletedAt === null &&
        careService.endedOn === null &&
        careService.specialtyId === specialty.id &&
        careService.contractingCompanyId === company.id,
    )
    if (duplicated) throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.DUPLICATED)

    const created = await this.careServiceRepository.createGuarded({
      affiliationId: affiliation.id,
      insuranceProviderId: affiliation.insuranceProviderId,
      careService: {
        episodeId: episode.id,
        specialtyId: specialty.id,
        contractingCompanyId: company.id,
        professionalId: command.professionalId,
      },
    })
    if (created.failure !== null) throwCareServiceCreateFailure(created.failure)

    return { careServiceId: created.careService.id }
  }
}
