import type { IAffiliationRepository } from '../../../domain/repositories/IAffiliationRepository.js'
import type { IClock } from '../../../domain/repositories/IClock.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type { IInsuranceProviderRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type { IPatientRepository } from '../../../domain/repositories/IPatientRepository.js'
import { statusAt, workQueueAt } from '../../../domain/services/patientStatus.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { AffiliationView, PatientDetail } from '../../dto/patientDto.js'

/**
 * La ficha del paciente, con todo lo derivado ya resuelto.
 *
 * El `status` y la bandeja se calculan sobre la historia COMPLETA de episodios.
 * Por eso el repositorio los devuelve todos y no solo los abiertos: filtrar ahi
 * rompe la auditoria sin que nadie lo note, porque la respuesta sigue
 * pareciendo razonable.
 */
export class GetPatientDetailUseCase {
  constructor(
    private readonly patientRepository: IPatientRepository,
    private readonly affiliationRepository: IAffiliationRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
    private readonly clock: IClock,
  ) {}

  async execute(patientId: string): Promise<PatientDetail> {
    const patient = await this.patientRepository.findById(patientId)
    if (patient === null) throw new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

    const [affiliations, episodes, contacts] = await Promise.all([
      this.affiliationRepository.listByPatient(patient.id),
      this.episodeRepository.listByPatient(patient.id),
      this.patientRepository.listContacts(patient.id),
    ])

    const today = this.clock.today()

    return {
      id: patient.id,
      lastName: patient.lastName,
      firstName: patient.firstName,
      documentNumber: patient.documentNumber,
      birthDate: patient.birthDate,
      addressStreet: patient.addressStreet,
      addressDetail: patient.addressDetail,
      localityId: patient.localityId,
      notes: patient.notes,

      status: statusAt(episodes, today),
      workQueue: workQueueAt(episodes, today),

      affiliations: await this.toAffiliationViews(affiliations),
      episodes: episodes.map((episode) => ({
        id: episode.id,
        affiliationId: episode.affiliationId,
        startsOn: episode.startsOn,
        endsOn: episode.endsOn,
        closeReason: episode.closeReason,
        closeNote: episode.closeNote,
      })),

      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
      })),
    }
  }

  private async toAffiliationViews(
    affiliations: readonly { id: string; insuranceProviderId: string; memberNumber: string; from: Date; to: Date | null }[],
  ): Promise<AffiliationView[]> {
    // Un paciente tiene una o dos afiliaciones, tres si cambio mucho. No hace
    // falta armar un cache: seria complejidad para un problema que no existe.
    const providerNames = new Map<string, string>()

    for (const affiliation of affiliations) {
      if (providerNames.has(affiliation.insuranceProviderId)) continue

      const provider = await this.insuranceProviderRepository.findById(
        affiliation.insuranceProviderId,
      )
      providerNames.set(affiliation.insuranceProviderId, provider?.name ?? '')
    }

    return affiliations.map((affiliation) => ({
      id: affiliation.id,
      insuranceProviderId: affiliation.insuranceProviderId,
      insuranceProviderName: providerNames.get(affiliation.insuranceProviderId) ?? '',
      memberNumber: affiliation.memberNumber,
      from: affiliation.from,
      to: affiliation.to,
      isCurrent: affiliation.to === null,
    }))
  }
}
