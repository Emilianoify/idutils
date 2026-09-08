import { z } from 'zod'
import { CloseReason } from '@/lib/domain/patient'

/**
 * Las reglas del episodio, espejo de `interfaces/http/schemas/episodeSchemas.ts`.
 *
 * Se replican del lado del navegador para fallar antes de la request, no para
 * inventar validaciones propias. La que manda sigue siendo la de la API.
 */

/** `YYYY-MM-DD`, lo que produce un `<input type="date">`. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha tiene que tener el formato AAAA-MM-DD' })
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  }, { error: 'Esa fecha no existe en el calendario' })

/**
 * La autorización inicial de una prestación. Opcional entera, no campo a campo.
 *
 * O se carga completa —frecuencia, desde y hasta— o no se carga: una
 * autorización sin fecha de vencimiento no se puede reclamar, y reclamar es
 * para lo que existe el sistema.
 */
export const authorizationDraftSchema = z
  .object({
    frequencyId: z.uuid({ error: 'Elegí una frecuencia' }),
    validFrom: dateOnly,
    validUntil: dateOnly,
    notes: z.string(),
  })
  .refine((value) => value.validUntil >= value.validFrom, {
    error: 'La autorización no puede vencer antes de empezar',
    path: ['validUntil'],
  })

export type AuthorizationDraftInput = z.infer<typeof authorizationDraftSchema>

export const episodeCareServiceSchema = z.object({
  specialtyId: z.uuid({ error: 'Elegí una especialidad' }),
  contractingCompanyId: z.uuid({ error: 'Elegí la empresa a la que se le reclama' }),
  /** Se puede abrir sin profesional asignado y asignarlo después. */
  professionalId: z.uuid().nullable(),
  authorization: authorizationDraftSchema.nullable(),
})

export type EpisodeCareServiceInput = z.infer<typeof episodeCareServiceSchema>

/**
 * `startsOn` PUEDE SER FUTURO, y no lleva validación de "no mayor que hoy".
 *
 * Cuando avisan que el paciente vuelve el jueves, el episodio arranca el
 * jueves: el backend lo declara explícitamente y prohibirlo acá sería vetar el
 * caso real más común.
 */
export const openEpisodeSchema = z.object({
  startsOn: dateOnly,
  careServices: z.array(episodeCareServiceSchema),
})

export type OpenEpisodeInput = z.infer<typeof openEpisodeSchema>

/**
 * El cierre. `closeReason` es obligatorio.
 *
 * No es burocracia: es lo que decide en qué bandeja cae el paciente. Sin
 * motivo, un hueco podría ser una internación, una baja o un cambio de obra
 * social, y las tres se trabajan distinto.
 */
export const closeEpisodeSchema = z.object({
  endsOn: dateOnly,
  closeReason: z.enum(CloseReason, { error: 'Elegí un motivo de cierre' }),
  closeNote: z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value.length === 0 ? null : value)),
})

export type CloseEpisodeInput = z.infer<typeof closeEpisodeSchema>
