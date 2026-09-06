/**
 * Los cuatro estados de cobertura, espejo de `AuthorizationStatus` del backend.
 *
 * Está duplicado a propósito y no compartido por un paquete: el frontend habla
 * con la API por HTTP, y este es el contrato de esa conversación. Si el backend
 * agrega un estado, esto NO COMPILA hasta que alguien decida de qué color es y
 * cómo se lee. Un `string` suelto se lo tragaría en silencio.
 *
 * Los valores quedan en castellano porque son valores del negocio, no
 * identificadores: viajan por la red tal cual los manda el dominio.
 */
export const AuthorizationStatus = {
  /** Hay una autorización que cubre hoy y le sobra margen. */
  VIGENTE: 'VIGENTE',
  /** Cubre hoy, pero vence dentro del umbral de aviso. Hay que reclamar. */
  POR_VENCER: 'POR_VENCER',
  /** Hubo autorizaciones, ninguna cubre hoy. Se pasó el reclamo. */
  VENCIDA: 'VENCIDA',
  /** La prestación existe y nunca se autorizó. No es lo mismo que vencida. */
  SIN_AUTORIZACION: 'SIN_AUTORIZACION',
} as const

export type AuthorizationStatus =
  (typeof AuthorizationStatus)[keyof typeof AuthorizationStatus]

interface StatusStyle {
  text: string
  background: string
  border: string
}

/**
 * Estado -> clases de Tailwind.
 *
 * Las clases están escritas COMPLETAS, no armadas con plantillas: Tailwind lee
 * el código fuente para saber qué generar, y una clase construida en tiempo de
 * ejecución (`text-${status}`) no existe en el CSS final. Es el bug clásico y
 * aparece recién en producción, porque en desarrollo el JIT ve más.
 *
 * Es un Record exhaustivo: falta un estado y no compila.
 */
export const STATUS_STYLES: Record<AuthorizationStatus, StatusStyle> = {
  VIGENTE: {
    text: 'text-covered',
    background: 'bg-covered',
    border: 'border-covered',
  },
  POR_VENCER: {
    text: 'text-expiring',
    background: 'bg-expiring',
    border: 'border-expiring',
  },
  VENCIDA: {
    text: 'text-expired',
    background: 'bg-expired',
    border: 'border-expired',
  },
  SIN_AUTORIZACION: {
    text: 'text-unauthorized',
    background: 'bg-unauthorized',
    border: 'border-unauthorized',
  },
}
