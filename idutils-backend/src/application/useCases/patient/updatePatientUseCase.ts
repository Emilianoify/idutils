import type { ILocalityRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type {
  IPatientRepository,
  PatientChanges,
} from '../../../domain/repositories/IPatientRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Corrección de los datos del paciente.
 *
 * Es una CORRECCIÓN, no un hecho del negocio: se escribió mal el apellido, se
 * mudó de piso, cambió el timbre. Por eso es lo único del paciente que se edita
 * en el lugar.
 *
 * Lo que NO se toca desde acá, y es a propósito:
 *
 *  - la cobertura, que se cambia con `ChangeInsuranceProviderUseCase` porque
 *    cierra la afiliación anterior Y el episodio abierto (D8 + D9);
 *  - el estado, que no es una columna: se deriva de los episodios.
 *
 * Si este caso de uso pudiera tocar cualquiera de las dos, la regla de negocio
 * tendría una puerta de atrás, y las puertas de atrás se usan.
 */
export class UpdatePatientUseCase {
  constructor(
    private readonly patientRepository: IPatientRepository,
    private readonly localityRepository: ILocalityRepository,
  ) {}

  async execute(patientId: string, changes: PatientChanges): Promise<void> {
    const patient = await this.patientRepository.findById(patientId)
    if (patient === null) throw new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

    // La localidad es siempre FK al catálogo, nunca texto libre (D12). La base
    // lo garantiza con la clave foránea; esto está para dar el mensaje que
    // nombra el campo en vez de "alguno de los datos relacionados no existe".
    if (changes.localityId !== undefined) {
      const locality = await this.localityRepository.findById(changes.localityId)
      if (locality === null) {
        throw new AppError(404, ERROR_MESSAGES.PATIENT.LOCALITY_NOT_FOUND)
      }
    }

    await this.patientRepository.update(patient.id, changes)
  }
}
