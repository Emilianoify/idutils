import { z } from 'zod'

/**
 * Las reglas de una prestación sobre un episodio ya abierto.
 *
 * Espejo de `interfaces/http/schemas/careServiceSchemas.ts`. Fijate lo que NO
 * está: la obra social. Sale de la afiliación del episodio, del lado del
 * servidor. Si viajara desde acá, un cliente podría mandar la que le convenga y
 * la validación de convenio de D2 se evapora.
 */

/** `YYYY-MM-DD`, lo que produce un `<input type="date">`. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha tiene que tener el formato AAAA-MM-DD' })
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  }, { error: 'Esa fecha no existe en el calendario' })

export const createCareServiceSchema = z.object({
  specialtyId: z.uuid({ error: 'Elegí una especialidad' }),
  contractingCompanyId: z.uuid({ error: 'Elegí la empresa a la que se le reclama' }),
  /** Sin asignar es un estado válido, no un campo sin completar. */
  professionalId: z.uuid().nullable(),
})

export type CreateCareServiceInput = z.infer<typeof createCareServiceSchema>

/**
 * Fin de una prestación, sin cerrar el episodio.
 *
 * No toca las demás: terminó kinesiología y enfermería sigue. Cerrar el
 * episodio es otro hecho, con otro motivo y otra consecuencia sobre la bandeja
 * del paciente.
 *
 * Se dice "terminar" y no "dar de baja": esa palabra queda reservada para el
 * paciente cargado por error, que es el único lugar donde algo se retira del
 * sistema en vez de terminar su curso.
 */
export const endCareServiceSchema = z.object({
  endedOn: dateOnly,
})

export type EndCareServiceInput = z.infer<typeof endCareServiceSchema>
