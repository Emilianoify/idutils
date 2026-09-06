import type { IInsuranceProviderRepository, ILocalityRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type { IUnitOfWork } from '../../../domain/repositories/IUnitOfWork.js'
import { PatientStatus } from '../../../domain/enums/patientStatus.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { normalizeMemberNumber } from '../../../shared/normalization/memberNumber.js'
import type { CreatePatientCommand, PatientSummary } from '../../dto/patientDto.js'

/**
 * Alta de paciente con su afiliacion.
 *
 * Los dos se crean en la MISMA transaccion porque son un solo hecho: un
 * paciente sin cobertura es un alta a medias que despues nadie sabe de donde
 * salio, y la coordinacion termina llamando por telefono para reconstruirla.
 *
 * El paciente nace SIN_INICIAR: existe en el sistema pero todavia no tiene
 * episodio de ID. Ese es un segundo movimiento, y esta bien que lo sea.
 */
export class CreatePatientUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
    private readonly localityRepository: ILocalityRepository,
  ) {}

  async execute(command: CreatePatientCommand): Promise<PatientSummary> {
    const provider = await this.insuranceProviderRepository.findById(
      command.affiliation.insuranceProviderId,
    )
    if (provider === null) {
      throw new AppError(404, ERROR_MESSAGES.AFFILIATION.INSURANCE_PROVIDER_NOT_FOUND)
    }

    const locality = await this.localityRepository.findById(command.localityId)
    if (locality === null) {
      throw new AppError(404, ERROR_MESSAGES.PATIENT.LOCALITY_NOT_FOUND)
    }

    const primaryContacts = command.contacts.filter((contact) => contact.isPrimary)
    if (primaryContacts.length > 1) {
      throw new AppError(
        400,
        'Solo puede haber un contacto principal',
      )
    }

    // Se normaliza UNA VEZ, aca, y se usa el mismo valor para chequear y para
    // guardar. Chequear con el valor crudo y guardar el normalizado (o al
    // reves) es como el indice unico parcial deja pasar un duplicado.
    const memberNumber = normalizeMemberNumber(command.affiliation.memberNumber)

    return this.unitOfWork.run(async (repositories) => {
      // La base tiene el indice unico parcial y es la garantia real. Esto esta
      // para dar el mensaje que dice QUE HACER, en vez de un error de Postgres.
      const taken = await repositories.affiliations.findCurrentByMemberNumber(
        provider.id,
        memberNumber,
      )
      if (taken !== null) {
        throw new AppError(409, ERROR_MESSAGES.AFFILIATION.ALREADY_TAKEN)
      }

      const patient = await repositories.patients.create({
        lastName: command.lastName,
        firstName: command.firstName,
        documentNumber: command.documentNumber,
        birthDate: command.birthDate,
        addressStreet: command.addressStreet,
        addressDetail: command.addressDetail,
        localityId: locality.id,
        notes: command.notes,
      })

      const affiliation = await repositories.affiliations.create({
        patientId: patient.id,
        insuranceProviderId: provider.id,
        memberNumber,
        from: command.affiliation.from,
      })

      for (const contact of command.contacts) {
        await repositories.patients.addContact({
          patientId: patient.id,
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone,
          isPrimary: contact.isPrimary,
        })
      }

      return {
        id: patient.id,
        lastName: patient.lastName,
        firstName: patient.firstName,
        documentNumber: patient.documentNumber,
        status: PatientStatus.SIN_INICIAR,
        insuranceProviderName: provider.name,
        memberNumber: affiliation.memberNumber,
      }
    })
  }
}
