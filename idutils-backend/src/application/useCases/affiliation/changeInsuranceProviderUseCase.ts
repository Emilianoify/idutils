import { CloseReason } from '../../../generated/prisma/enums.js'
import type { IInsuranceProviderRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type { IUnitOfWork } from '../../../domain/repositories/IUnitOfWork.js'
import { PatientStatus } from '../../../domain/enums/patientStatus.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { normalizeMemberNumber } from '../../../shared/normalization/memberNumber.js'

export interface ChangeInsuranceProviderCommand {
  patientId: string
  insuranceProviderId: string
  memberNumber: string
  /** Dia en que arranca la cobertura nueva. Cierra la anterior y el episodio. */
  changedOn: Date
}

/**
 * Cambio de obra social (D8 + D9).
 *
 * Son tres escrituras y UN solo hecho:
 *   1. se cierra la afiliacion anterior con `to`
 *   2. se cierra el episodio abierto con motivo CAMBIO_OBRA_SOCIAL
 *   3. se abre la afiliacion nueva
 *
 * A medias quedaria un episodio abierto colgado de una afiliacion cerrada, que
 * es un estado que el modelo declara imposible. Por eso va en transaccion.
 *
 * NO SE ABRE UN EPISODIO NUEVO, y es a proposito. La obra social nueva puede
 * autorizar otras especialidades y otras frecuencias: nada de lo anterior
 * sobrevive. El paciente queda en PENDIENTE_REAUTORIZACION, que es la bandeja
 * "reautorizar", y el operador abre el episodio nuevo cuando tenga los papeles.
 *
 * El paciente NO se duplica. Sigue siendo la misma persona: es exactamente lo
 * que el Excel no puede hacer, y donde hoy se pierde el historial.
 */
export class ChangeInsuranceProviderUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
  ) {}

  async execute(
    command: ChangeInsuranceProviderCommand,
  ): Promise<{ affiliationId: string; status: PatientStatus }> {
    const provider = await this.insuranceProviderRepository.findById(command.insuranceProviderId)
    if (provider === null) {
      throw new AppError(404, ERROR_MESSAGES.AFFILIATION.INSURANCE_PROVIDER_NOT_FOUND)
    }

    const memberNumber = normalizeMemberNumber(command.memberNumber)

    return this.unitOfWork.run(async (repositories) => {
      const patient = await repositories.patients.findById(command.patientId)
      if (patient === null) throw new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

      const taken = await repositories.affiliations.findCurrentByMemberNumber(
        provider.id,
        memberNumber,
      )
      if (taken !== null && taken.patientId !== patient.id) {
        throw new AppError(409, ERROR_MESSAGES.AFFILIATION.ALREADY_TAKEN)
      }

      const current = await repositories.affiliations.findCurrentByPatient(patient.id)
      if (current !== null) {
        if (command.changedOn.getTime() <= current.from.getTime()) {
          throw new AppError(400, ERROR_MESSAGES.AFFILIATION.CLOSES_BEFORE_START)
        }
        await repositories.affiliations.close(current.id, command.changedOn)
      }

      const openEpisode = await repositories.episodes.findOpenByPatient(patient.id)
      if (openEpisode !== null) {
        if (command.changedOn.getTime() <= openEpisode.startsOn.getTime()) {
          throw new AppError(400, ERROR_MESSAGES.EPISODE.CLOSES_BEFORE_START)
        }
        await repositories.episodes.close(openEpisode.id, {
          endsOn: command.changedOn,
          closeReason: CloseReason.CAMBIO_OBRA_SOCIAL,
        })
      }

      const affiliation = await repositories.affiliations.create({
        patientId: patient.id,
        insuranceProviderId: provider.id,
        memberNumber,
        from: command.changedOn,
      })

      return {
        affiliationId: affiliation.id,
        // Sin episodio abierto y con el ultimo cerrado por cambio de obra
        // social, el estado derivado es este. No se guarda: se calcula.
        status: PatientStatus.PENDIENTE_REAUTORIZACION,
      }
    })
  }
}
