/**
 * Los dos derivados del paciente, espejo del backend.
 *
 * `PatientStatus` y `WorkQueue` NO son columnas: el backend los calcula a
 * partir de los episodios y su motivo de cierre (D9), y llegan ya resueltos en
 * el DTO. Acá se muestran, nunca se recalculan — dos implementaciones de la
 * misma regla terminan siempre con una desactualizada, y la del cliente es la
 * que nadie mira.
 *
 * Están duplicados a mano y no compartidos por un paquete: el contrato entre
 * frontend y backend es HTTP. Si el backend agrega un estado, el `Record`
 * exhaustivo de abajo NO COMPILA hasta que alguien decida cómo se lee.
 */

export const PatientStatus = {
  /** Episodio abierto y ya comenzado. */
  ACTIVO: 'ACTIVO',
  /** Episodio abierto con inicio futuro: vuelve el jueves. */
  REINGRESA: 'REINGRESA',
  /** Último episodio cerrado por internación en sanatorio. */
  INTERNADO: 'INTERNADO',
  /** Se cayó la cobertura y el paciente sigue estando. */
  PENDIENTE_REAUTORIZACION: 'PENDIENTE_REAUTORIZACION',
  /**
   * Terminó la internación domiciliaria: alta médica, baja voluntaria o
   * mudanza fuera de zona.
   *
   * Se llama EGRESADO y no BAJA a propósito. "Baja" en una coordinación
   * significa cinco cosas —baja de kinesiología, baja del paciente cargado por
   * error, baja voluntaria, baja del catálogo— y el operador tiene que adivinar
   * cuál por contexto. "Egreso" significa una sola: la persona dejó el
   * servicio. Tampoco se usa "alta", que tira para los dos lados: alta médica
   * es irse, dar de alta es cargar.
   */
  EGRESADO: 'EGRESADO',
  FALLECIDO: 'FALLECIDO',
  /** Cargado en el sistema pero todavía sin ningún episodio. */
  SIN_INICIAR: 'SIN_INICIAR',
} as const

export type PatientStatus = (typeof PatientStatus)[keyof typeof PatientStatus]

export const WorkQueue = {
  /** Internado en sanatorio. SIN FECHA: nadie sabe cuándo vuelve. */
  ESPERANDO_ALTA: 'ESPERANDO_ALTA',
  /** Hay que reautorizar para que el paciente vuelva a tener cobertura. */
  REAUTORIZAR: 'REAUTORIZAR',
  /** No hay nada que hacer. */
  CERRADO: 'CERRADO',
  /** Fallecimiento. No es una bandeja de trabajo: es archivo. */
  ARCHIVO: 'ARCHIVO',
} as const

export type WorkQueue = (typeof WorkQueue)[keyof typeof WorkQueue]

interface StatusPresentation {
  label: string
  /** Clases completas, nunca armadas con plantilla: Tailwind lee el código fuente. */
  tone: string
}

export const STATUS_PRESENTATION: Record<PatientStatus, StatusPresentation> = {
  ACTIVO: { label: 'Activo', tone: 'text-covered' },
  REINGRESA: { label: 'Reingresa', tone: 'text-covered' },
  INTERNADO: { label: 'Internado', tone: 'text-expiring' },
  PENDIENTE_REAUTORIZACION: {
    label: 'Pendiente de reautorización',
    tone: 'text-expired',
  },
  EGRESADO: { label: 'Egresado', tone: 'text-light-faint' },
  FALLECIDO: { label: 'Fallecido', tone: 'text-light-faint' },
  SIN_INICIAR: { label: 'Sin iniciar', tone: 'text-unauthorized' },
}

export const QUEUE_LABELS: Record<WorkQueue, string> = {
  ESPERANDO_ALTA: 'Esperando alta',
  REAUTORIZAR: 'Reautorizar',
  CERRADO: 'Cerrado',
  ARCHIVO: 'Archivo',
}

/**
 * Las bandejas que el operador tiene que mirar.
 *
 * `CERRADO` y `ARCHIVO` no son pendientes: son el resultado de que ya no haya
 * nada que hacer. Mostrarlos junto a los otros dos convertiría la pantalla de
 * pendientes en un listado más.
 */
export function isPending(queue: WorkQueue): boolean {
  return queue === WorkQueue.ESPERANDO_ALTA || queue === WorkQueue.REAUTORIZAR
}

/** `Pérez, Ana`. El apellido primero: es por donde se busca a una persona. */
export function fullName(patient: { lastName: string; firstName: string }): string {
  return patient.firstName.length === 0
    ? patient.lastName
    : `${patient.lastName}, ${patient.firstName}`
}

/**
 * El motivo de cierre de un episodio, espejo de `CloseReason` de schema.prisma.
 *
 * No es un dato decorativo: es lo que decide en qué bandeja queda el paciente.
 * Internación manda a "esperando alta", fin de cobertura a "reautorizar", y
 * alta médica a ningún lado, porque no hay nada que hacer.
 */
export const CloseReason = {
  INTERNACION: 'INTERNACION',
  ALTA_MEDICA: 'ALTA_MEDICA',
  CAMBIO_OBRA_SOCIAL: 'CAMBIO_OBRA_SOCIAL',
  FIN_COBERTURA: 'FIN_COBERTURA',
  SUSPENSION_EMPRESA: 'SUSPENSION_EMPRESA',
  BAJA_VOLUNTARIA: 'BAJA_VOLUNTARIA',
  MUDANZA_FUERA_DE_ZONA: 'MUDANZA_FUERA_DE_ZONA',
  FALLECIMIENTO: 'FALLECIMIENTO',
} as const

export type CloseReason = (typeof CloseReason)[keyof typeof CloseReason]

export const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  INTERNACION: 'Internación',
  ALTA_MEDICA: 'Alta médica',
  CAMBIO_OBRA_SOCIAL: 'Cambio de obra social',
  FIN_COBERTURA: 'Fin de cobertura',
  SUSPENSION_EMPRESA: 'Suspensión de la empresa',
  BAJA_VOLUNTARIA: 'Baja voluntaria',
  MUDANZA_FUERA_DE_ZONA: 'Mudanza fuera de zona',
  FALLECIMIENTO: 'Fallecimiento',
}
