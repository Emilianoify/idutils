import type { IPasswordHasher } from '../../domain/repositories/IPasswordHasher.js'
import type { ITokenService } from '../../domain/repositories/ITokenService.js'
import type { Infrastructure } from '../../infrastructure/container.js'

/**
 * Todo lo que la capa HTTP necesita para existir, por parametro.
 *
 * Ni un `new PrismaClient()` ni un `import { env }` adentro de un controller.
 * El dia que un controller construya su propio repositorio, el test de esa ruta
 * necesita una base de datos y deja de escribirse. Recibir todo por aca es lo
 * que hace que `createApp` sea una funcion pura de sus dependencias.
 */
export interface HttpDependencies {
  infrastructure: Infrastructure
  tokenService: ITokenService
  passwordHasher: IPasswordHasher
  /** Origenes permitidos por CORS. Nunca `*`: con cookies no es una opcion. */
  allowedOrigins: readonly string[]
  /** `true` solo detras de HTTPS. */
  cookieSecure: boolean
  /**
   * Cuantos saltos de reverse proxy confiar para leer la IP real.
   *
   * 0 = ninguno. Confiar de mas deja que cualquiera mande un X-Forwarded-For
   * inventado y esquive el limite de intentos de login; confiar de menos hace
   * que toda la coordinacion comparta la IP del proxy y se limiten entre si.
   */
  trustProxyHops: number
}
