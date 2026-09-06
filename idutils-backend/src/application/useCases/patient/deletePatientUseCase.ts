import type { IUnitOfWork } from '../../../domain/repositories/IUnitOfWork.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Baja de un paciente CARGADO POR ERROR. No es un alta médica ni una baja del
 * servicio.
 *
 * La distinción es toda la regla: si el paciente tiene episodios, existió de
 * verdad —hubo internación domiciliaria, hubo prestaciones, hubo
 * autorizaciones— y esa historia es con la que se defiende una auditoría. Lo
 * que corresponde ahí es CERRAR EL EPISODIO con su motivo, no hacer desaparecer
 * a la persona. Por eso un paciente con episodios no se puede dar de baja, y el
 * mensaje dice qué hacer en su lugar.
 *
 * Sirve para el caso real: se cargó dos veces, o se equivocaron de persona, y
 * hay que sacarlo de la lista antes de que alguien lo llame.
 *
 * LA AFILIACIÓN TAMBIÉN SE DA DE BAJA, y no es un detalle de prolijidad. El
 * índice único parcial de `core_invariants.sql` filtra por
 * `"to" IS NULL AND "deletedAt" IS NULL`: si la afiliación quedara viva, seguiría
 * ocupando el par (obra social, N° de afiliado) para siempre, y el paciente de
 * verdad —el que se quiso cargar— no se podría dar de alta nunca. El síntoma
 * sería "ya hay un paciente con ese número" señalando a alguien que no está en
 * ninguna lista.
 *
 * Los dos movimientos van en UNA transacción: a medias queda exactamente el
 * estado que este caso de uso existe para evitar.
 */
export class DeletePatientUseCase {
  constructor(private readonly unitOfWork: IUnitOfWork) {}

  async execute(patientId: string): Promise<void> {
    await this.unitOfWork.run(async (repositories) => {
      const patient = await repositories.patients.findById(patientId)
      if (patient === null) throw new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

      const episodes = await repositories.episodes.listByPatient(patient.id)
      if (episodes.length > 0) {
        throw new AppError(409, ERROR_MESSAGES.PATIENT.HAS_EPISODES)
      }

      const affiliations = await repositories.affiliations.listByPatient(patient.id)
      for (const affiliation of affiliations) {
        await repositories.affiliations.softDelete(affiliation.id)
      }

      await repositories.patients.softDelete(patient.id)
    })
  }
}
