import type { IAffiliationRepository } from '../../../domain/repositories/IAffiliationRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type { IInsuranceProviderRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type { IPatientRepository } from '../../../domain/repositories/IPatientRepository.js'
import type { IClock } from '../../../domain/repositories/IClock.js'
import { statusAt } from '../../../domain/services/patientStatus.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { normalizeMemberNumber } from '../../../shared/normalization/memberNumber.js'
import type { AffiliationLookupResult } from '../../dto/patientDto.js'

/**
 * El paso que D8 exige ANTES de crear un paciente.
 *
 * Al cargar una afiliacion cuyo (obra social, N de afiliado) no existe, el
 * sistema obliga a buscar en el listado y decidir: vincular a un paciente
 * existente o crear uno nuevo. La vinculacion es manual y explicita.
 *
 * Por que no se adivina: el DNI no siempre viene, y matchear por nombre es
 * exactamente como el Excel termina con tres Juan Perez. Preferimos frenar al
 * operador un segundo antes que ensuciar el historial para siempre.
 */
export class LookupAffiliationUseCase {
  constructor(
    private readonly affiliationRepository: IAffiliationRepository,
    private readonly patientRepository: IPatientRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
    private readonly clock: IClock,
  ) {}

  async execute(
    insuranceProviderId: string,
    rawMemberNumber: string,
  ): Promise<AffiliationLookupResult> {
    const provider = await this.insuranceProviderRepository.findById(insuranceProviderId)
    if (provider === null) {
      throw new AppError(404, ERROR_MESSAGES.AFFILIATION.INSURANCE_PROVIDER_NOT_FOUND)
    }

    // Con el numero crudo el indice no encuentra nada y el sistema deja
    // duplicar en silencio, que es el peor de los resultados posibles.
    const memberNumber = normalizeMemberNumber(rawMemberNumber)

    const affiliation = await this.affiliationRepository.findCurrentByMemberNumber(
      provider.id,
      memberNumber,
    )
    if (affiliation === null) {
      return { found: false, patient: null }
    }

    const patient = await this.patientRepository.findById(affiliation.patientId)
    if (patient === null) {
      // Una afiliacion vigente apuntando a un paciente que no existe es
      // inconsistencia de datos, no un "no encontrado".
      throw new AppError(500, ERROR_MESSAGES.PATIENT.NOT_FOUND)
    }

    const episodes = await this.episodeRepository.listByPatient(patient.id)

    return {
      found: true,
      patient: {
        id: patient.id,
        lastName: patient.lastName,
        firstName: patient.firstName,
        documentNumber: patient.documentNumber,
        status: statusAt(episodes, this.clock.today()),
        insuranceProviderName: provider.name,
        memberNumber: affiliation.memberNumber,
      },
    }
  }
}
