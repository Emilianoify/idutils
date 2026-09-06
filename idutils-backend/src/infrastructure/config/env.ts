import 'dotenv/config'
import { z } from 'zod'
import { ERROR_MESSAGES } from '../../shared/constants/messages.js'

/**
 * Las variables de entorno, validadas al arrancar.
 *
 * El proceso MUERE si falta o esta mal una sola. Es a proposito y es la unica
 * forma que sirve: un `process.env.JWT_SECRET` sin validar se convierte en
 * `undefined`, jsonwebtoken firma igual, y el problema aparece en produccion
 * como "no me deja entrar" tres semanas despues de instalar.
 *
 * `dotenv/config` esta para comodidad de desarrollo. En Docker no hay archivo
 * `.env`: las variables llegan del contenedor y dotenv no hace nada, que es
 * exactamente lo que corresponde.
 *
 * Este modulo lo importa SOLO `main.ts`. El resto del sistema recibe lo que
 * necesita por constructor, y por eso los tests no tienen que inventar un
 * entorno para poder importar un repositorio.
 */

export const NodeEnv = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const

export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv]

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, { error: ERROR_MESSAGES.ENV.DATABASE_URL_INVALID }),

    NODE_ENV: z
      .enum([NodeEnv.DEVELOPMENT, NodeEnv.PRODUCTION, NodeEnv.TEST], {
        error: ERROR_MESSAGES.ENV.NODE_ENV_INVALID,
      })
      .default(NodeEnv.DEVELOPMENT),

    PORT: z.coerce.number().int().positive().default(4000),

    // 32 caracteres es el minimo para que HS256 no sea el eslabon debil. Un
    // secreto corto se rompe por fuerza bruta sin tocar el servidor.
    JWT_SECRET: z.string().min(32, { error: ERROR_MESSAGES.ENV.JWT_SECRET_INVALID }),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, { error: ERROR_MESSAGES.ENV.JWT_REFRESH_SECRET_INVALID }),

    /** Lista separada por coma. Nunca `*`: con cookies, `*` no es una opcion. */
    ALLOWED_ORIGINS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(z.url({ error: ERROR_MESSAGES.ENV.ALLOWED_ORIGINS_INVALID })).min(1)),

    /**
     * `true` SOLO si se sirve por HTTPS. En HTTP plano el browser descarta la
     * cookie y el sintoma es un login que "no hace nada".
     */
    COOKIE_SECURE: z
      .enum(['true', 'false'], { error: ERROR_MESSAGES.ENV.COOKIE_SECURE_INVALID })
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * Saltos de reverse proxy en los que confiar. En Docker detras de nginx
     * suele ser 1; sin proxy adelante tiene que quedar en 0.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  })
  .refine((value) => value.JWT_SECRET !== value.JWT_REFRESH_SECRET, {
    // Con el mismo secreto para los dos, un access token robado se puede
    // presentar en /auth/refresh y renovarse solo para siempre. Los dos
    // secretos distintos son lo que hace que eso sea imposible, no improbable.
    error: ERROR_MESSAGES.ENV.JWT_SECRETS_EQUAL,
    path: ['JWT_REFRESH_SECRET'],
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== NodeEnv.PRODUCTION) return

    if (!value.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: ERROR_MESSAGES.ENV.PRODUCTION_COOKIE_INSECURE,
        path: ['COOKIE_SECURE'],
      })
    }

    if (value.TRUST_PROXY_HOPS < 1) {
      context.addIssue({
        code: 'custom',
        message: ERROR_MESSAGES.ENV.PRODUCTION_PROXY_UNTRUSTED,
        path: ['TRUST_PROXY_HOPS'],
      })
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * Lee y valida el entorno. Tira con TODAS las fallas juntas, no con la primera:
 * quien instala tiene que poder arreglar el `.env` de una sola pasada.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`No se puede arrancar: el entorno no es válido.\n${details}`)
  }

  return result.data
}
