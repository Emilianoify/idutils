import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'

/**
 * El cliente de Prisma sobre el driver adapter de `pg`.
 *
 * Se construye con una funcion y no como singleton importable a proposito: el
 * proceso HTTP, el seed y los tests de integracion necesitan cada uno el suyo,
 * y un modulo con estado global obliga a que el orden de los imports decida
 * cuando se abre la conexion. Aca lo decide el que arranca el proceso.
 *
 * `DATABASE_URL` se lee una sola vez, aca. Si falta, el proceso no arranca:
 * una instalacion sin base configurada tiene que fallar al inicio y no a la
 * primera consulta del operador (D3, una instalacion por coordinacion).
 */
export function createPrismaClient(
  connectionString: string | undefined = process.env.DATABASE_URL,
): PrismaClient {
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error(
      'Falta DATABASE_URL. Copiá .env.example a .env y apuntalo a la base de la coordinación',
    )
  }

  return new PrismaClient({ adapter: new PrismaPg(connectionString) })
}
