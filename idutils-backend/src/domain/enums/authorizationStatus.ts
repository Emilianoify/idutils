/**
 * El estado de cobertura de una prestacion a una fecha. Derivado de sus
 * autorizaciones, nunca almacenado: una columna "vencida" hay que salir a
 * actualizarla todas las noches, y la noche que el cron no corre el dashboard
 * miente sin avisar.
 *
 * Este es el corazon del sistema. IDUtils no es un sistema de registro: es un
 * sistema de vencimientos y reclamos.
 */
export const AuthorizationStatus = {
  /** Hay una autorizacion que cubre la fecha y le sobra margen. */
  VIGENTE: 'VIGENTE',
  /** Cubre la fecha, pero vence dentro del umbral de aviso. Hay que reclamar. */
  POR_VENCER: 'POR_VENCER',
  /** Hubo autorizaciones, ninguna cubre la fecha. Se paso el reclamo. */
  VENCIDA: 'VENCIDA',
  /** La prestacion existe y nunca se autorizo. No es lo mismo que vencida. */
  SIN_AUTORIZACION: 'SIN_AUTORIZACION',
} as const

export type AuthorizationStatus = (typeof AuthorizationStatus)[keyof typeof AuthorizationStatus]

/**
 * Umbral de aviso por defecto, en dias.
 *
 * Es un default del dominio, no una constante escondida: la coordinacion tiene
 * que poder correrlo. Treinta dias es lo que tarda una empresa en renovar una
 * autorizacion cuando se le reclama a tiempo.
 */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30

/** Las dos que exigen accion del operador. Son la razon de ser del dashboard. */
export function requiresClaim(status: AuthorizationStatus): boolean {
  return status === AuthorizationStatus.POR_VENCER || status === AuthorizationStatus.VENCIDA
}
