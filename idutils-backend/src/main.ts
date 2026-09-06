import { createInfrastructure } from './infrastructure/container.js'
import { loadEnv } from './infrastructure/config/env.js'
import { createPrismaClient } from './infrastructure/database/prismaClient.js'
import { logger } from './infrastructure/logging/logger.js'
import { Argon2PasswordHasher } from './infrastructure/security/argon2PasswordHasher.js'
import { JwtTokenService } from './infrastructure/security/jwtTokenService.js'
import { createApp } from './interfaces/http/app.js'

/**
 * El unico lugar del sistema que lee el entorno, abre la conexion y escucha un
 * puerto. Todo lo demas recibe lo que necesita por parametro.
 *
 * Es lo que hace que la aplicacion se pueda probar entera sin Postgres: si
 * cualquier capa de abajo importara `env`, alcanzaria con importar un
 * repositorio para que un test exija un `.env` completo.
 */
async function main(): Promise<void> {
  // Primero el entorno: si falta un secreto, el proceso tiene que morir ACA y
  // no en el primer login de un operador tres semanas despues.
  const env = loadEnv()

  const prisma = createPrismaClient(env.DATABASE_URL)
  const infrastructure = createInfrastructure(prisma)

  const app = createApp({
    infrastructure,
    tokenService: new JwtTokenService(env.JWT_SECRET, env.JWT_REFRESH_SECRET),
    passwordHasher: new Argon2PasswordHasher(),
    allowedOrigins: env.ALLOWED_ORIGINS,
    cookieSecure: env.COOKIE_SECURE,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  })

  const server = app.listen(env.PORT, () => {
    logger.info('IDUtils escuchando', { port: env.PORT, nodeEnv: env.NODE_ENV })
  })

  /**
   * Apagado ordenado.
   *
   * Docker manda SIGTERM y espera diez segundos antes de matar el proceso a lo
   * bruto. Sin esto, cada `docker compose up -d` corta a la mitad la request
   * que estuviera en vuelo: en este sistema, eso es un alta de paciente que se
   * pierde entre el INSERT del paciente y el de la afiliacion.
   */
  const shutdown = (signal: string): void => {
    logger.info('Apagando', { signal })

    server.close(() => {
      void prisma
        .$disconnect()
        .catch((error: unknown) => logger.error('Fallo al cerrar la base', { error }))
        .finally(() => process.exit(0))
    })

    // Si algo quedo colgado, no se espera para siempre: el orquestador lo va a
    // matar igual, y es mejor un cierre propio que un SIGKILL.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  // Falla al arrancar: entorno invalido, base inalcanzable, puerto ocupado. Se
  // loguea entero y se sale con codigo distinto de cero para que el orquestador
  // no crea que el contenedor arranco bien.
  logger.error('No se pudo arrancar IDUtils', { error })
  process.exit(1)
})
