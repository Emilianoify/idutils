import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

/**
 * Lo minimo que un repositorio necesita para consultar: el cliente completo o
 * el cliente de una transaccion, indistinto.
 *
 * `Prisma.TransactionClient` es el cliente SIN `$transaction`, `$connect` ni
 * `$disconnect`, y por eso es el tipo correcto: un repositorio que pudiera
 * abrir su propia transaccion o cerrar la conexion rompe la que lo envuelve.
 */
export type PrismaExecutor = Prisma.TransactionClient

/**
 * El executor mas la capacidad de correr algo atomicamente.
 *
 * Existe por un caso concreto: `setPrimaryContact` baja el contacto anterior y
 * sube el nuevo, y la base tiene un unique parcial de un solo principal por
 * paciente. En dos pasos sueltos queda un paciente sin principal si el proceso
 * se cae en el medio.
 *
 * Lo que resuelve `atomically` es la ANIDACION: adentro de una transaccion no
 * se puede abrir otra. Cuando el contexto ya es transaccional, corre el trabajo
 * tal cual sobre la transaccion en curso; cuando es el cliente raiz, abre una.
 */
export interface PrismaContext {
  readonly executor: PrismaExecutor
  atomically<T>(work: (executor: PrismaExecutor) => Promise<T>): Promise<T>
}

/** Contexto sobre el cliente raiz: `atomically` abre una transaccion nueva. */
export function createRootContext(client: PrismaClient): PrismaContext {
  return {
    executor: client,
    atomically: (work) => client.$transaction((transaction) => work(transaction)),
  }
}

/** Contexto adentro de una transaccion: `atomically` reusa la que ya corre. */
export function createTransactionContext(transaction: PrismaExecutor): PrismaContext {
  return {
    executor: transaction,
    atomically: (work) => work(transaction),
  }
}
