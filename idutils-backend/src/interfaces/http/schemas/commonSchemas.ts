import { z } from 'zod'
import { parseDateOnly } from '../../../shared/helpers/dateOnly.js'

/**
 * El borde donde el transporte se convierte en dominio.
 *
 * Por HTTP todo llega como texto. Estas piezas son las que lo transforman UNA
 * vez, aca, para que ningun caso de uso reciba un string donde declaro un
 * `Date`. Es la misma disciplina que `normalizeMemberNumber`: si la conversion
 * se repite en tres controllers, en tres meses van a estar desincronizadas.
 */

function isRealDate(value: string): boolean {
  try {
    parseDateOnly(value)
    return true
  } catch {
    return false
  }
}

/**
 * `YYYY-MM-DD` a `Date` de medianoche UTC.
 *
 * NUNCA `z.coerce.date()`: eso llama a `new Date(string)`, que interpreta la
 * fecha en el huso local y en Argentina la corre un dia para atras. El episodio
 * arrancaria el 21 en produccion y el 22 en la maquina del que lo programo, y
 * ese bug ya costo caro una vez.
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha tiene que tener el formato YYYY-MM-DD' })
  .refine(isRealDate, { error: 'Esa fecha no existe en el calendario' })
  .transform((value) => parseDateOnly(value))

export const idSchema = z.uuid({ error: 'El identificador no es válido' })

/** Los `:id` de la ruta. Se validan igual que el cuerpo: tambien vienen de afuera. */
export const idParamsSchema = z.object({ id: idSchema })

/**
 * Paginado con techo.
 *
 * El `max(100)` no es burocracia: sin el, un `?limit=999999` convierte una
 * consulta barata en una que se lleva la base puesta, y no hace falta mala fe
 * para escribirlo.
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Saca las claves que valen `undefined`.
 *
 * Es el puente entre Zod y el dominio. Un `.optional()` de Zod produce
 * `{ name?: string | undefined }`, y los puertos declaran `{ name?: string }`:
 * con `exactOptionalPropertyTypes` esos dos tipos NO son el mismo. La
 * diferencia importa de verdad en un update parcial, donde "no mandaron el
 * campo" y "mandaron el campo vacío" tienen que hacer cosas distintas.
 */
export function definedOnly<T extends object>(value: T): {
  [K in keyof T]?: Exclude<T[K], undefined>
} {
  const result: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = item
  }

  return result as { [K in keyof T]?: Exclude<T[K], undefined> }
}
