import type { CloseReason } from '../../generated/prisma/enums.js'

/**
 * El periodo de internacion domiciliaria, que abre y cierra (D9).
 *
 * Se llama HomeCareEpisode y no Internacion porque en la jerga la internacion
 * domiciliaria ES el episodio, e "internado" es lo que lo termina.
 *
 * La internacion en sanatorio no se guarda como entidad: es el hueco entre un
 * episodio cerrado con INTERNACION y el siguiente.
 */
export interface HomeCareEpisode {
  id: string
  patientId: string
  /** Exactamente una. Cambiar de afiliacion cierra el episodio. */
  affiliationId: string
  /**
   * Dato de entrada, JAMAS `now()`. Puede ser futuro: cuando avisan que el
   * paciente vuelve el jueves, se abre el episodio con fecha del jueves.
   */
  startsOn: Date
  /** null = abierto. */
  endsOn: Date | null
  /** No nulo si y solo si `endsOn` no es nulo. La base lo garantiza con un CHECK. */
  closeReason: CloseReason | null
  /** Ej.: en que sanatorio quedo internado. */
  closeNote: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * El hueco entre dos episodios: el paciente internado en un sanatorio.
 *
 * No se persiste, se calcula (`hospitalizationPeriods`). `to === null` es una
 * internacion en curso, y no lleva fecha estimada de retorno a proposito:
 * nadie sabe cuando vuelve, y ese campo se llenaria con inventos.
 */
export interface HospitalizationPeriod {
  /** Dia en que cerro el episodio anterior. Inclusive. */
  from: Date
  /** Dia en que abrio el siguiente. Exclusive: ese dia ya esta en casa. */
  to: Date | null
  /** null mientras la internacion sigue abierta. */
  days: number | null
  /** Lo que anoto el operador al cerrar: en que sanatorio esta. */
  note: string | null
}
