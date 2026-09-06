import type { IAuthorizationRepository } from '../../../domain/repositories/IAuthorizationRepository.js'
import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IFrequencyRepository } from '../../../domain/repositories/ICatalogRepository.js'
import { validateAuthorizationDraft } from '../../../domain/services/authorizationRules.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { assertNoViolations } from '../../../shared/errors/assertNoViolations.js'
import { throwAuthorizationCreateFailure } from './throwAuthorizationCreateFailure.js'

export interface CreateAuthorizationCommand {
  careServiceId: string
  frequencyId: string
  validFrom: Date
  validUntil: Date
  notes: string
}

/**
 * Registra una autorizacion nueva sobre una prestacion existente.
 *
 * Es lo que pasa cuando la empresa renueva: NO se edita la anterior, se agrega
 * una fila. La prestacion vive; las autorizaciones se suceden abajo. Asi la
 * linea de tiempo para una auditoria no hay que construirla, y se puede
 * contestar cuantas veces hubo que reclamar esta prestacion (D10).
 *
 * No se valida que no se solape con la anterior a proposito: la empresa a veces
 * autoriza el periodo nuevo antes de que termine el viejo, y eso es bueno, no
 * un error. `coverageAt` resuelve el solapamiento quedandose con la que llega
 * mas lejos.
 */
export class CreateAuthorizationUseCase {
  constructor(
    private readonly authorizationRepository: IAuthorizationRepository,
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly frequencyRepository: IFrequencyRepository,
  ) {}

  async execute(command: CreateAuthorizationCommand): Promise<{ authorizationId: string }> {
    const careService = await this.careServiceRepository.findById(command.careServiceId)
    if (careService === null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.NOT_FOUND)
    }

    const frequency = await this.frequencyRepository.findById(command.frequencyId)
    if (frequency === null) {
      throw new AppError(404, ERROR_MESSAGES.AUTHORIZATION.FREQUENCY_NOT_FOUND)
    }

    const eligible = await this.frequencyRepository.listEligibleForSpecialty(
      careService.specialtyId,
    )

    assertNoViolations(
      validateAuthorizationDraft({
        careServiceEndedOn: careService.endedOn,
        careServiceDeletedAt: careService.deletedAt,
        frequency,
        eligibleFrequencyIds: eligible.map((candidate) => candidate.id),
        validFrom: command.validFrom,
        validUntil: command.validUntil,
      }),
      ERROR_MESSAGES.AUTHORIZATION,
    )

    const created = await this.authorizationRepository.createGuarded({
      careServiceId: careService.id,
      frequencyId: frequency.id,
      validFrom: command.validFrom,
      validUntil: command.validUntil,
      notes: command.notes,
    })
    if (created.failure !== null) throwAuthorizationCreateFailure(created.failure)

    return { authorizationId: created.authorization.id }
  }
}
