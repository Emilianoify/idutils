import type { IAffiliationRepository } from '../../../domain/repositories/IAffiliationRepository.js'
import type { IClock } from '../../../domain/repositories/IClock.js'
import type { IHomeCareEpisodeRepository } from '../../../domain/repositories/IHomeCareEpisodeRepository.js'
import type { IInsuranceProviderRepository } from '../../../domain/repositories/ICatalogRepository.js'
import type {
  IPatientRepository,
  PatientSearchCriteria,
} from '../../../domain/repositories/IPatientRepository.js'
import { statusAt } from '../../../domain/services/patientStatus.js'
import type { PatientSearchResultDto } from '../../dto/patientDto.js'

/**
 * El listado con el que el operador decide si vincular o crear (D8).
 *
 * No es una pantalla de reportes: es el segundo paso obligatorio del alta.
 * Cuando entra una afiliacion cuyo (obra social, N de afiliado) no existe, el
 * sistema OBLIGA a buscar aca y decidir a mano. Sin este listado, `lookup`
 * devuelve "no existe" y el operador no tiene a donde ir.
 *
 * El estado se calcula por paciente, con sus episodios: son varias consultas
 * por pagina, y esta bien. Una coordinacion no tiene un problema de volumen,
 * tiene un problema de memoria (D0), y la pagina viene topeada en 100. El dia
 * que una instalacion sufra esto, la respuesta es un puerto de lectura como
 * `IDashboardQuery` —una consulta con los joins hechos— y NO una columna
 * `estado` que alguien tenga que mantener al dia.
 */
export class SearchPatientsUseCase {
  constructor(
    private readonly patientRepository: IPatientRepository,
    private readonly affiliationRepository: IAffiliationRepository,
    private readonly episodeRepository: IHomeCareEpisodeRepository,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
    private readonly clock: IClock,
  ) {}

  async execute(criteria: PatientSearchCriteria): Promise<PatientSearchResultDto> {
    const { items, total } = await this.patientRepository.search(criteria)
    const today = this.clock.today()

    // Una coordinacion trabaja con un puñado de obras sociales: el cache evita
    // repetir la misma consulta veinte veces por pagina y no complica nada.
    const providerNames = new Map<string, string>()

    const summaries = await Promise.all(
      items.map(async (patient) => {
        const [affiliation, episodes] = await Promise.all([
          this.affiliationRepository.findCurrentByPatient(patient.id),
          this.episodeRepository.listByPatient(patient.id),
        ])

        return {
          id: patient.id,
          lastName: patient.lastName,
          firstName: patient.firstName,
          documentNumber: patient.documentNumber,
          status: statusAt(episodes, today),
          insuranceProviderName:
            affiliation === null
              ? null
              : await this.providerName(affiliation.insuranceProviderId, providerNames),
          memberNumber: affiliation?.memberNumber ?? null,
        }
      }),
    )

    return { items: summaries, total }
  }

  private async providerName(
    insuranceProviderId: string,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const cached = cache.get(insuranceProviderId)
    if (cached !== undefined) return cached

    const provider = await this.insuranceProviderRepository.findById(insuranceProviderId)
    if (provider === null) return null

    cache.set(insuranceProviderId, provider.name)
    return provider.name
  }
}
