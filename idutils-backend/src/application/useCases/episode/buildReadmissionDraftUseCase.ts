import type { IAffiliationRepository } from '../../../domain/repositories/IAffiliationRepository.js'
import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type {
  IContractingCompanyRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../../domain/repositories/ICatalogRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import { carryOverForReadmission } from '../../../domain/services/careServiceRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { ReadmissionDraft, ReadmissionDraftItem } from '../../dto/episodeDto.js'

/**
 * Arma el borrador de reingreso a partir del ultimo episodio (D9, consecuencia 5).
 *
 * ES UN BORRADOR, NO UN HECHO. Este caso de uso NO ESCRIBE NADA: propone. El
 * operador saca, agrega o cambia, y recien al confirmar corre `OpenEpisodeUseCase`
 * y se crean las prestaciones. Si copiara solo, algun dia habria prestaciones
 * que nadie miro.
 *
 * Copia especialidad, empresa y profesional. No copia autorizaciones,
 * frecuencias ni fechas: nada de eso sobrevive al cierre, y es la razon por la
 * que el episodio se cerro.
 *
 * Ademas revalida el convenio contra la afiliacion VIGENTE, que puede no ser la
 * misma del episodio viejo. Si el paciente volvio con otra obra social, una
 * empresa que antes servia puede no servir mas, y es mejor que el operador lo
 * vea marcado en el borrador y no como un error al confirmar.
 */
export class BuildReadmissionDraftUseCase {
  constructor(
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly affiliationRepository: IAffiliationRepository,
    private readonly specialtyRepository: ISpecialtyRepository,
    private readonly contractingCompanyRepository: IContractingCompanyRepository,
    private readonly professionalRepository: IProfessionalRepository,
  ) {}

  async execute(patientId: string): Promise<ReadmissionDraft> {
    const episodes = await this.episodeRepository.listByPatient(patientId)
    const source = episodes.at(-1)
    if (source === undefined) throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)

    const current = await this.affiliationRepository.findCurrentByPatient(patientId)
    if (current === null) {
      throw new AppError(409, ERROR_MESSAGES.EPISODE.AFFILIATION_NOT_CURRENT)
    }

    const previousServices = await this.careServiceRepository.listByEpisode(source.id)
    const carried = carryOverForReadmission(previousServices)

    const warnings: string[] = []
    const careServices: ReadmissionDraftItem[] = []

    for (const item of carried) {
      const [specialty, company] = await Promise.all([
        this.specialtyRepository.findById(item.specialtyId),
        this.contractingCompanyRepository.findById(item.contractingCompanyId),
      ])

      const providers = await this.careServiceRepository.listInsuranceProviderIdsForCompany(
        item.contractingCompanyId,
      )
      const stillValid =
        specialty !== null &&
        specialty.active &&
        company !== null &&
        company.active &&
        providers.includes(current.insuranceProviderId)

      const professional =
        item.professionalId === null
          ? null
          : await this.professionalRepository.findById(item.professionalId)

      if (!stillValid) {
        warnings.push(
          `${specialty?.name ?? 'Especialidad dada de baja'} por ${company?.name ?? 'empresa dada de baja'}: revisá antes de confirmar`,
        )
      }

      careServices.push({
        specialtyId: item.specialtyId,
        specialtyName: specialty?.name ?? '',
        contractingCompanyId: item.contractingCompanyId,
        contractingCompanyName: company?.name ?? '',
        professionalId: item.professionalId,
        professionalName:
          professional === null ? null : `${professional.lastName}, ${professional.firstName}`,
        stillValid,
      })
    }

    return {
      patientId,
      sourceEpisodeId: source.id,
      careServices,
      warnings,
    }
  }
}
