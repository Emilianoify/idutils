import type { Authorization } from '../entities/authorizationEntity.js'

export type NewAuthorization = Omit<
  Authorization,
  'id' | 'claimedAt' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export const AuthorizationCreateFailure = {
  CARE_SERVICE_NOT_FOUND: 'CARE_SERVICE_NOT_FOUND',
  CARE_SERVICE_ENDED: 'CARE_SERVICE_ENDED',
  EPISODE_NOT_FOUND: 'EPISODE_NOT_FOUND',
  EPISODE_CLOSED: 'EPISODE_CLOSED',
  FREQUENCY_NOT_FOUND: 'FREQUENCY_NOT_FOUND',
  FREQUENCY_INACTIVE: 'FREQUENCY_INACTIVE',
  FREQUENCY_NOT_ELIGIBLE: 'FREQUENCY_NOT_ELIGIBLE',
  INVALID_PERIOD: 'INVALID_PERIOD',
} as const

export type AuthorizationCreateFailure =
  (typeof AuthorizationCreateFailure)[keyof typeof AuthorizationCreateFailure]

export interface GuardedAuthorizationCreate {
  careServiceId: string
  frequencyId: string
  validFrom: Date
  validUntil: Date
  notes: string
  /**
   * La fecha contra la que se decide si el episodio sigue corriendo.
   *
   * Un episodio con cierre PROGRAMADO todavia acepta una renovacion: es
   * exactamente el caso que el tablero muestra como reclamo pendiente.
   */
  asOf: Date
}

export type GuardedAuthorizationCreateResult =
  | { authorization: Authorization; failure: null }
  | { authorization: null; failure: AuthorizationCreateFailure }

export interface IAuthorizationRepository {
  findById(id: string): Promise<Authorization | null>

  /**
   * Todas las de la prestacion, mas nueva primero.
   *
   * Esta lista ES la linea de tiempo para una auditoria: no hay que
   * construirla. Y contesta "cuantas veces tuve que reclamar esta prestacion",
   * que es el dato con el que se pelea un contrato (D10).
   */
  listByCareService(careServiceId: string): Promise<Authorization[]>

  create(authorization: NewAuthorization): Promise<Authorization>

  /** Revalida y bloquea la prestación, el episodio, la frecuencia y su relación antes del alta. */
  createGuarded(input: GuardedAuthorizationCreate): Promise<GuardedAuthorizationCreateResult>

  /**
   * Registra el reclamo de renovacion.
   *
   * No crea una autorizacion nueva: la nueva nace cuando la empresa la otorga.
   * Reclamar y autorizar son dos hechos distintos, y confundirlos es como el
   * sistema termina diciendo que algo esta autorizado porque alguien mando un
   * WhatsApp.
   */
  markClaimed(id: string, claimedAt: Date): Promise<Authorization>
}
