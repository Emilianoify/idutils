import type {
  IFrequencyRepository,
  IProfessionalRepository,
} from '../../../domain/repositories/ICatalogRepository.js'
import type { IUnitOfWork, TransactionalRepositories } from '../../../domain/repositories/IUnitOfWork.js'
import { validateAuthorizationDraft } from '../../../domain/services/authorizationRules.js'
import { validateCareServiceDraft } from '../../../domain/services/careServiceRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { assertNoViolations } from '../../../shared/errors/assertNoViolations.js'
import type { OpenEpisodeCareServiceCommand, OpenEpisodeCommand } from '../../dto/episodeDto.js'
import { throwCareServiceCreateFailure } from '../careService/throwCareServiceCreateFailure.js'
import { throwAuthorizationCreateFailure } from '../authorization/throwAuthorizationCreateFailure.js'

/**
 * Abre un episodio de internacion domiciliaria, con sus prestaciones.
 *
 * Todo en una transaccion: el episodio, las prestaciones y sus autorizaciones
 * son el mismo movimiento del negocio. Si se cortara a la mitad quedaria un
 * episodio abierto con prestaciones incompletas, y el dashboard lo mostraria
 * como trabajo pendiente sin que nadie haya hecho nada mal.
 *
 * `startsOn` viene del comando y puede ser futuro. JAMAS `now()`: cuando avisan
 * que el paciente vuelve el jueves, el episodio arranca el jueves.
 */
export class OpenEpisodeUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly professionalRepository: IProfessionalRepository,
    private readonly frequencyRepository: IFrequencyRepository,
  ) {}

  async execute(command: OpenEpisodeCommand): Promise<{ episodeId: string }> {
    this.assertNoDuplicatedCareServices(command.careServices)

    return this.unitOfWork.run(async (repositories) => {
      const patient = await repositories.patients.findById(command.patientId)
      if (patient === null) throw new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

      const affiliation = await repositories.affiliations.findById(command.affiliationId)
      if (affiliation === null || affiliation.patientId !== patient.id) {
        throw new AppError(404, ERROR_MESSAGES.AFFILIATION.NOT_FOUND)
      }

      // Un episodio cuelga de la afiliacion vigente. Colgarlo de una cerrada
      // deja un estado que el modelo declara imposible: el episodio se cierra
      // JUSTAMENTE cuando cambia la afiliacion (D9).
      if (affiliation.to !== null) {
        throw new AppError(409, ERROR_MESSAGES.EPISODE.AFFILIATION_NOT_CURRENT)
      }

      const open = await repositories.episodes.findOpenByPatient(patient.id)
      if (open !== null) throw new AppError(409, ERROR_MESSAGES.EPISODE.ALREADY_OPEN)

      const episode = await repositories.episodes.create({
        patientId: patient.id,
        affiliationId: affiliation.id,
        startsOn: command.startsOn,
      })

      for (const item of orderCareServicesForLocking(command.careServices)) {
        await this.createCareService(repositories, {
          episode,
          affiliationId: affiliation.id,
          insuranceProviderId: affiliation.insuranceProviderId,
          item,
        })
      }

      return { episodeId: episode.id }
    })
  }

  /**
   * El mismo par especialidad+empresa dos veces en un alta es un error de
   * carga, no un caso valido. La base lo rechaza con el unique parcial, pero
   * ahi el mensaje ya no dice cual de las dos filas sobra.
   */
  private assertNoDuplicatedCareServices(items: readonly OpenEpisodeCareServiceCommand[]): void {
    const keys = items.map((item) => `${item.specialtyId}:${item.contractingCompanyId}`)

    if (new Set(keys).size !== keys.length) {
      throw new AppError(409, ERROR_MESSAGES.CARE_SERVICE.DUPLICATED)
    }
  }

  private async createCareService(
    repositories: TransactionalRepositories,
    context: {
      episode: { id: string }
      affiliationId: string
      insuranceProviderId: string
      item: OpenEpisodeCareServiceCommand
    },
  ): Promise<void> {
    const { episode, affiliationId, insuranceProviderId, item } = context

    const companyProviders = await repositories.careServices.listInsuranceProviderIdsForCompany(
      item.contractingCompanyId,
    )
    const professionalSpecialties =
      item.professionalId === null
        ? []
        : await this.professionalRepository.listSpecialtyIds(item.professionalId)

    const violations = validateCareServiceDraft({
      // El episodio se acaba de crear en esta misma transaccion: esta abierto
      // por construccion.
      episodeEndsOn: null,
      episodeDeletedAt: null,
      insuranceProviderId,
      contractingCompanyId: item.contractingCompanyId,
      specialtyId: item.specialtyId,
      professionalId: item.professionalId,
      companyInsuranceProviderIds: companyProviders,
      professionalSpecialtyIds: professionalSpecialties,
    })

    assertNoViolations(violations, ERROR_MESSAGES.CARE_SERVICE)

    const created = await repositories.careServices.createGuarded({
      affiliationId,
      insuranceProviderId,
      careService: {
        episodeId: episode.id,
        specialtyId: item.specialtyId,
        contractingCompanyId: item.contractingCompanyId,
        professionalId: item.professionalId,
      },
    })
    if (created.failure !== null) throwCareServiceCreateFailure(created.failure)

    const careService = created.careService

    if (item.authorization === null) return

    const frequency = await this.frequencyRepository.findById(item.authorization.frequencyId)
    if (frequency === null) {
      throw new AppError(404, ERROR_MESSAGES.AUTHORIZATION.FREQUENCY_NOT_FOUND)
    }

    const eligible = await this.frequencyRepository.listEligibleForSpecialty(item.specialtyId)

    const authorizationViolations = validateAuthorizationDraft({
      careServiceEndedOn: null,
      careServiceDeletedAt: null,
      frequency,
      eligibleFrequencyIds: eligible.map((candidate) => candidate.id),
      validFrom: item.authorization.validFrom,
      validUntil: item.authorization.validUntil,
    })

    assertNoViolations(authorizationViolations, ERROR_MESSAGES.AUTHORIZATION)

    const authorization = await repositories.authorizations.createGuarded({
      careServiceId: careService.id,
      frequencyId: frequency.id,
      validFrom: item.authorization.validFrom,
      validUntil: item.authorization.validUntil,
      notes: item.authorization.notes,
    })
    if (authorization.failure !== null) {
      throwAuthorizationCreateFailure(authorization.failure)
    }
  }
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function orderCareServicesForLocking(
  items: readonly OpenEpisodeCareServiceCommand[],
): OpenEpisodeCareServiceCommand[] {
  return [...items].sort(
    (left, right) =>
      compareId(left.specialtyId, right.specialtyId) ||
      compareId(left.contractingCompanyId, right.contractingCompanyId) ||
      (left.professionalId === null
        ? right.professionalId === null
          ? 0
          : -1
        : right.professionalId === null
          ? 1
          : compareId(left.professionalId, right.professionalId)),
  )
}
