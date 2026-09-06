import 'dotenv/config'
import { z } from 'zod'

/**
 * El entorno que necesita el SEED. Su propio esquema, no el de la aplicacion.
 *
 * El seed no firma tokens ni atiende pedidos: pedirle `JWT_SECRET` para correr
 * seria obligar a configurar cosas que no usa, y ese es el camino por el que
 * alguien termina poniendo un valor cualquiera con tal de que arranque.
 *
 * La contrasena del administrador NO tiene default y NO se genera sola. Un
 * default —`admin123`, `changeme`, lo que sea— es una credencial conocida que
 * sobrevive a la instalacion, y sobrevive justamente en las instalaciones donde
 * nadie la cambio.
 */
const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL es obligatoria' }),

  SEED_ADMIN_EMAIL: z.email({
    error: 'SEED_ADMIN_EMAIL tiene que ser un correo válido',
  }),

  SEED_ADMIN_PASSWORD: z.string().min(12, {
    error:
      'SEED_ADMIN_PASSWORD es obligatoria y necesita al menos 12 caracteres. Ponela en .env, no en el código',
  }),

  SEED_ADMIN_NAME: z.string().min(1).default('Administración'),

  /**
   * Datos de ejemplo para poder probar la API a mano: una obra social, una
   * empresa con convenio, una localidad y un profesional.
   *
   * Apagado por defecto. Es la separacion que evita que "SanityCare" termine
   * en el selector de una coordinacion de verdad.
   */
  SEED_DEMO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export type SeedEnv = z.infer<typeof seedEnvSchema>

export function loadSeedEnv(source: NodeJS.ProcessEnv = process.env): SeedEnv {
  const result = seedEnvSchema.safeParse(source)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`No se puede sembrar: falta configuración.\n${details}`)
  }

  return result.data
}
