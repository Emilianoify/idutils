import type { AuthorizationStatus } from '../../domain/enums/authorizationStatus.js'

/**
 * La linea de tiempo de una prestacion, tal como se lee en una auditoria.
 *
 * Es una VISTA, no la entidad: cada fila trae la frecuencia ya renderizada con
 * el sustantivo de la especialidad (D11), porque esa regla vive en
 * `formatFrequency` y no puede tener una segunda implementacion del otro lado
 * del cable.
 */
export interface AuthorizationView {
  id: string
  frequencyId: string
  /** "2 sesiones semanales", con el sustantivo CONGELADO de esa autorizacion. */
  frequencyLabel: string
  validFrom: Date
  /** Inclusive: "hasta el 30/9" cubre el 30/9. */
  validUntil: Date
  /** Cuando se reclamo la renovacion. null = todavia no se reclamo. */
  claimedAt: Date | null
  notes: string
}

/**
 * La prestacion con su historia y su estado de cobertura a hoy.
 *
 * `status`, `daysUntilExpiry` y `needsClaim` los deriva `coverageAt`, del lado
 * del servidor. El cliente los MUESTRA: volver a calcularlos seria una segunda
 * implementacion de la regla mas importante del sistema, y la del cliente es la
 * que se desactualiza sin que nadie se entere.
 */
export interface CareServiceTimeline {
  careServiceId: string
  /** Lo necesita el selector de frecuencias al renovar: el filtro es por especialidad (D11). */
  specialtyId: string
  specialtyName: string
  /** null = todavia sin asignar. La prestacion existe igual. */
  professionalName: string | null
  contractingCompanyName: string
  /** Fecha de baja individual de la prestacion. */
  endedOn: Date | null
  /**
   * Cierre del episodio al que cuelga. null = el episodio sigue abierto.
   *
   * Cambia como se LEE todo lo de abajo: con el episodio cerrado, la cobertura
   * no es "como esta hoy" sino "como estaba cuando cerro". Sin este dato, una
   * prestacion de un episodio cerrado en marzo se muestra vigente en septiembre
   * porque su autorizacion todavia no vencio, y eso es mentira: no se le esta
   * haciendo nada a ese paciente.
   */
  episodeEndsOn: Date | null
  /**
   * Si el episodio YA terminó a la fecha de hoy.
   *
   * No es `episodeEndsOn !== null`: un episodio se puede cerrar con fecha
   * FUTURA —"el paciente se va el jueves"— y hasta ese dia sigue corriendo. Con
   * cierre programado para manana, esto es `false` y la cobertura se lee como
   * lo que es: la de hoy.
   */
  episodeFinished: boolean

  status: AuthorizationStatus
  /** Dias hasta el vencimiento de la vigente. 0 = vence hoy. */
  daysUntilExpiry: number | null
  /** Desde cuando esta descubierta, cuando no hay cobertura. */
  uncoveredSince: Date | null
  /**
   * La autorizacion que hay que reclamar. Es la que cubre hoy, o la ultima que
   * vencio si ya no hay cobertura: reclamar es pedir que renueven ESA.
   */
  claimableAuthorizationId: string | null
  /** Lo que el operador tiene que hacer hoy con esta prestacion. */
  needsClaim: boolean

  /** Mas nueva primero. Esta lista ES la linea de tiempo (D10). */
  authorizations: AuthorizationView[]
}
