import { z } from 'zod'
import type { CloseReason } from '@/lib/domain/patient'
import { WorkQueue } from '@/lib/domain/patient'
import { apiFetch } from './client'

/**
 * Episodios: abrir y cerrar.
 *
 * Son los dos únicos verbos, y no hay `PATCH`. Un episodio no se edita: se
 * abre, y se cierra con un motivo. Ese motivo es lo que decide en qué bandeja
 * de trabajo queda el paciente, así que corregirlo después reescribiría una
 * decisión del negocio.
 */

const openedEpisodeSchema = z.object({
  episodeId: z.string(),
})

const closedEpisodeSchema = z.object({
  /**
   * La bandeja donde queda el paciente, ya derivada del motivo de cierre.
   *
   * El backend la devuelve para que la pantalla pueda decir "queda en Esperando
   * alta" en el mismo momento en que el operador cierra, y no lo descubra tres
   * días después mirando una lista.
   */
  queue: z.enum(WorkQueue),
})

export type OpenedEpisode = z.infer<typeof openedEpisodeSchema>
export type ClosedEpisode = z.infer<typeof closedEpisodeSchema>

const openedEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: openedEpisodeSchema,
})

const closedEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: closedEpisodeSchema,
})

export interface OpenEpisodeCareService {
  specialtyId: string
  contractingCompanyId: string
  professionalId: string | null
  /**
   * Opcional de verdad: la prestación puede existir mientras se espera el
   * papel. El tablero la va a mostrar como SIN AUTORIZACIÓN, que es
   * exactamente lo que es — y no lo mismo que vencida.
   */
  authorization: {
    frequencyId: string
    validFrom: string
    validUntil: string
    notes: string
  } | null
}

export interface OpenEpisodeBody {
  patientId: string
  affiliationId: string
  /** Puede ser FUTURO: cuando avisan que el paciente vuelve el jueves. */
  startsOn: string
  careServices: OpenEpisodeCareService[]
}

/**
 * Abre el episodio CON sus prestaciones, en un solo pedido.
 *
 * Van juntas porque son el mismo movimiento del negocio. Cortado a la mitad
 * quedaría un episodio abierto con prestaciones incompletas, y el tablero lo
 * mostraría como trabajo pendiente sin que nadie haya hecho nada mal.
 */
export async function openEpisode(body: OpenEpisodeBody): Promise<OpenedEpisode> {
  const response = await apiFetch(
    '/api/episodes',
    { method: 'POST', body: JSON.stringify(body) },
    openedEnvelope.parse,
  )
  return response.data
}

export interface CloseEpisodeBody {
  endsOn: string
  /**
   * Obligatorio, y no es un dato de archivo: es lo que decide la bandeja.
   * Sin motivo, un hueco podría ser una internación, una baja o un cambio de
   * obra social, y la bandeja directamente no existe.
   */
  closeReason: CloseReason
  /** Ej.: en qué sanatorio quedó internado. */
  closeNote: string | null
}

export async function closeEpisode(
  episodeId: string,
  body: CloseEpisodeBody,
): Promise<ClosedEpisode> {
  const response = await apiFetch(
    `/api/episodes/${episodeId}/close`,
    { method: 'POST', body: JSON.stringify(body) },
    closedEnvelope.parse,
  )
  return response.data
}
