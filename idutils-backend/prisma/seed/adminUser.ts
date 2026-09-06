import type { PrismaClient } from '../../src/generated/prisma/client.js'
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2PasswordHasher.js'
import { normalizeEmail } from '../../src/shared/normalization/email.js'

export interface AdminSeedResult {
  email: string
  created: boolean
}

/**
 * El primer usuario, el que abre la puerta.
 *
 * Si el correo YA EXISTE no se toca nada: ni la contrasena, ni el rol, ni el
 * estado. Es deliberado. Un seed que pisara la contrasena convertiria cada
 * `pnpm db:seed` en un reseteo silencioso de la credencial del administrador, y
 * el dia que alguien lo corra por costumbre despues de una migracion, la
 * contrasena que la coordinacion cambio hace seis meses vuelve a ser la del
 * `.env` de instalacion.
 *
 * Para cambiarla existe el cambio de contrasena, que ademas invalida los tokens
 * emitidos. Eso es una operacion del sistema, no de un script de arranque.
 *
 * La contrasena viene del entorno y se hashea antes de tocar la base: en texto
 * plano no se guarda, no se loguea y no se devuelve.
 */
export async function seedAdminUser(
  client: PrismaClient,
  credentials: { email: string; password: string; name: string },
): Promise<AdminSeedResult> {
  const email = normalizeEmail(credentials.email)

  const existing = await client.user.findUnique({ where: { email } })
  if (existing !== null) {
    return { email, created: false }
  }

  const passwordHash = await new Argon2PasswordHasher().hash(credentials.password)

  await client.user.create({
    data: {
      email,
      passwordHash,
      name: credentials.name,
      role: 'ADMIN',
    },
  })

  return { email, created: true }
}
