import type {
  CareService,
  CareServiceWithAuthorizations,
} from '../entities/careServiceEntity.js'

export type NewCareService = Omit<
  CareService,
  'id' | 'endedOn' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export const CareServiceCreateFailure = {
  EPISODE_NOT_FOUND: 'EPISODE_NOT_FOUND',
  EPISODE_CLOSED: 'EPISODE_CLOSED',
  AFFILIATION_NOT_FOUND: 'AFFILIATION_NOT_FOUND',
  AFFILIATION_NOT_CURRENT: 'AFFILIATION_NOT_CURRENT',
  SPECIALTY_NOT_FOUND: 'SPECIALTY_NOT_FOUND',
  SPECIALTY_INACTIVE: 'SPECIALTY_INACTIVE',
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  COMPANY_INACTIVE: 'COMPANY_INACTIVE',
  PROFESSIONAL_NOT_FOUND: 'PROFESSIONAL_NOT_FOUND',
  PROFESSIONAL_INACTIVE: 'PROFESSIONAL_INACTIVE',
  COMPANY_PROVIDER_MISSING: 'COMPANY_PROVIDER_MISSING',
  PROFESSIONAL_SPECIALTY_MISSING: 'PROFESSIONAL_SPECIALTY_MISSING',
} as const

export type CareServiceCreateFailure =
  (typeof CareServiceCreateFailure)[keyof typeof CareServiceCreateFailure]

export interface GuardedCareServiceCreate {
  careService: NewCareService
  affiliationId: string
  insuranceProviderId: string
}

export type GuardedCareServiceCreateResult =
  | { careService: CareService; failure: null }
  | { careService: null; failure: CareServiceCreateFailure }

export interface ICareServiceRepository {
  findById(id: string): Promise<CareService | null>

  listByEpisode(episodeId: string): Promise<CareService[]>

  /**
   * Las prestaciones activas con sus autorizaciones, para el dashboard.
   *
   * Devuelve datos, no veredictos: el "por vencer" lo decide `coverageAt` sobre
   * lo que sale de aca. Una query que ya trajera el estado calculado seria una
   * segunda implementacion de la regla mas importante del sistema.
   *
   * Activa = episodio abierto y ya comenzado, `endedOn` nulo, sin baja logica.
   */
  listActiveWithAuthorizations(asOf: Date): Promise<CareServiceWithAuthorizations[]>

  create(careService: NewCareService): Promise<CareService>

  /** Revalida y bloquea todas las filas que autorizan el alta antes de insertarla. */
  createGuarded(input: GuardedCareServiceCreate): Promise<GuardedCareServiceCreateResult>

  /**
   * Asigna o desasigna solo si la prestación y su episodio siguen mutables.
   * Para una asignación también vuelve a comprobar en la escritura que el
   * profesional siga activo y habilitado para la especialidad.
   */
  assignProfessional(
    id: string,
    professionalId: string | null,
    specialtyId: string,
  ): Promise<CareService | null>

  /** Baja individual si la prestación y su episodio siguen mutables. */
  end(id: string, endedOn: Date): Promise<CareService | null>

  /**
   * Las obras sociales con las que la empresa tiene convenio (D2).
   *
   * Vive aca y no en un repositorio de catalogo porque es la validacion que
   * corre al crear una prestacion, y alimenta `validateCareServiceDraft`.
   */
  listInsuranceProviderIdsForCompany(contractingCompanyId: string): Promise<string[]>
}
