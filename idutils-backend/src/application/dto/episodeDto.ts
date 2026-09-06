import type { CloseReason } from '../../generated/prisma/enums.js'

export interface OpenEpisodeCommand {
  patientId: string
  affiliationId: string
  /**
   * Dato de entrada, jamas `now()`. Puede ser futuro: cuando avisan que el
   * paciente vuelve el jueves, se abre el episodio con fecha del jueves.
   */
  startsOn: Date
  /**
   * Prestaciones a crear junto con el episodio, normalmente el borrador de
   * reingreso ya revisado por el operador. Vacio es valido: el episodio se abre
   * y las prestaciones se cargan despues.
   */
  careServices: OpenEpisodeCareServiceCommand[]
}

export interface OpenEpisodeCareServiceCommand {
  specialtyId: string
  contractingCompanyId: string
  professionalId: string | null
  /**
   * Autorizacion inicial. Opcional: la prestacion puede existir mientras se
   * espera el papel, y el dashboard la va a mostrar como SIN_AUTORIZACION, que
   * es exactamente lo que es.
   */
  authorization: {
    frequencyId: string
    validFrom: Date
    validUntil: Date
    notes: string
  } | null
}

export interface CloseEpisodeCommand {
  episodeId: string
  endsOn: Date
  closeReason: CloseReason
  closeNote: string | null
}

/**
 * El borrador de reingreso (D9, consecuencia 5).
 *
 * ES UN BORRADOR, NO UN HECHO. El sistema propone; el operador saca, agrega o
 * cambia; recien al confirmar se crean las prestaciones. Si se copiara solo,
 * algun dia habria prestaciones que nadie miro.
 *
 * Fijate que no hay ni una fecha ni una frecuencia: nada de eso sobrevive al
 * cierre, y es la razon por la que el episodio se cerro.
 */
export interface ReadmissionDraft {
  patientId: string
  /** El episodio del que se copia. */
  sourceEpisodeId: string
  careServices: ReadmissionDraftItem[]
  /**
   * Advertencias para que el operador revise antes de confirmar. Ej.: la
   * empresa ya no tiene convenio con la obra social vigente.
   */
  warnings: string[]
}

export interface ReadmissionDraftItem {
  specialtyId: string
  specialtyName: string
  contractingCompanyId: string
  contractingCompanyName: string
  professionalId: string | null
  professionalName: string | null
  /** false = la empresa perdio el convenio; confirmar asi va a fallar. */
  stillValid: boolean
}
