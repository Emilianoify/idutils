import { DEFAULT_EXPIRY_WARNING_DAYS } from '../../../domain/enums/authorizationStatus.js'
import type { IAuthorizationRepository } from '../../../domain/repositories/IAuthorizationRepository.js'
import type { ICareServiceRepository } from '../../../domain/repositories/ICareServiceRepository.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type {
  IContractingCompanyRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../../domain/repositories/ICatalogRepository.js'
import type { IClock } from '../../../domain/repositories/IClock.js'
import { coverageAt, needsClaim } from '../../../domain/services/authorizationCoverage.js'
import { formatFrequency } from '../../../domain/services/frequencyLabel.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { CareServiceTimeline } from '../../dto/authorizationDto.js'

/**
 * La linea de tiempo de una prestacion, con su cobertura ya derivada.
 *
 * Existe como caso de uso y no como tres llamadas del controller porque aplica
 * `coverageAt`, que es la regla mas importante del sistema. Si el cliente
 * recibiera las autorizaciones peladas y decidiera por su cuenta cual esta
 * vigente, habria dos motores de vencimiento y el dia que cambie el umbral van
 * a decir cosas distintas.
 *
 * `formatFrequency` se aplica sobre la frecuencia CONGELADA de cada
 * autorizacion, no sobre el catalogo: la fuente de que se autorizo "2 sesiones
 * semanales" en agosto es esa fila, no lo que diga el catalogo hoy.
 */
export class GetCareServiceTimelineUseCase {
  constructor(
    private readonly careServiceRepository: ICareServiceRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly authorizationRepository: IAuthorizationRepository,
    private readonly specialtyRepository: ISpecialtyRepository,
    private readonly professionalRepository: IProfessionalRepository,
    private readonly contractingCompanyRepository: IContractingCompanyRepository,
    private readonly clock: IClock,
    private readonly warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
  ) {}

  async execute(careServiceId: string): Promise<CareServiceTimeline> {
    const careService = await this.careServiceRepository.findById(careServiceId)
    if (careService === null) {
      throw new AppError(404, ERROR_MESSAGES.CARE_SERVICE.NOT_FOUND)
    }

    const [episode, specialty, company, authorizations] = await Promise.all([
      this.episodeRepository.findById(careService.episodeId),
      this.specialtyRepository.findById(careService.specialtyId),
      this.contractingCompanyRepository.findById(careService.contractingCompanyId),
      this.authorizationRepository.listByCareService(careServiceId),
    ])

    if (episode === null) {
      throw new AppError(404, ERROR_MESSAGES.EPISODE.NOT_FOUND)
    }

    if (specialty === null) {
      throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)
    }
    if (company === null) {
      throw new AppError(404, ERROR_MESSAGES.CATALOG.COMPANY_NOT_FOUND)
    }

    const professional =
      careService.professionalId === null
        ? null
        : await this.professionalRepository.findById(careService.professionalId)

    const today = this.clock.today()

    /**
     * Un cierre con fecha FUTURA no termina el episodio todavia.
     *
     * Cerrar el 7/9 estando a 6/9 es programar la salida, no darla: hasta el
     * 7 el paciente sigue recibiendo prestaciones. Por eso no alcanza con
     * preguntar si `endsOn` existe.
     */
    const finished = episode.endsOn !== null && today.getTime() >= episode.endsOn.getTime()

    /**
     * La fecha contra la que se lee la cobertura.
     *
     * Mientras corre, es hoy. Una vez TERMINADO, es el dia del cierre: la
     * pregunta deja de ser "que le falta a este paciente" y pasa a ser "como
     * estaba la cobertura cuando esto terminó", que es lo que mira una
     * auditoria. Leerla contra hoy mostraria una prestacion de marzo como
     * vigente en septiembre solo porque su autorizacion no habia vencido.
     */
    const asOf = finished && episode.endsOn !== null ? episode.endsOn : today
    const coverage = coverageAt(authorizations, asOf, this.warningDays)

    // Se reclama la que cubre hoy; si ya no hay cobertura, la ultima que vencio.
    // Reclamar es pedir que renueven ESA, no crear una nueva: la nueva nace
    // cuando la empresa la otorga.
    const claimable = coverage.current ?? coverage.previous

    return {
      careServiceId: careService.id,
      specialtyId: specialty.id,
      specialtyName: specialty.name,
      professionalName:
        professional === null
          ? null
          : [professional.lastName, professional.firstName]
              .filter((part) => part !== null && part.length > 0)
              .join(', '),
      contractingCompanyName: company.name,
      endedOn: careService.endedOn,
      episodeEndsOn: episode.endsOn,
      episodeFinished: finished,

      status: coverage.status,
      daysUntilExpiry: coverage.daysUntilExpiry,
      uncoveredSince: coverage.previous?.validUntil ?? null,
      claimableAuthorizationId: claimable?.id ?? null,
      // Un episodio TERMINADO no tiene nada que reclamar: no se le esta
      // haciendo nada al paciente. Pero uno con cierre programado para el
      // jueves sigue corriendo, y lo que vence el martes hay que reclamarlo.
      needsClaim: !finished && needsClaim(coverage),

      authorizations: authorizations.map((authorization) => ({
        id: authorization.id,
        frequencyId: authorization.frequencyId,
        frequencyLabel: formatFrequency(
          { amount: authorization.frequencyAmount, unit: authorization.frequencyUnit },
          specialty.serviceUnit,
        ),
        validFrom: authorization.validFrom,
        validUntil: authorization.validUntil,
        claimedAt: authorization.claimedAt,
        notes: authorization.notes,
      })),
    }
  }
}
