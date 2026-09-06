import { defineConfig } from 'vitest/config'

/**
 * Los tests que necesitan un Postgres levantado y migrado.
 *
 * Config aparte para que `pnpm test` siga siendo el comando que corre en
 * cualquier maquina sin preparar nada. Estos se corren con
 * `pnpm test:integration` contra la base de `DATABASE_URL`.
 *
 * `fileParallelism: false`: todos truncan las mismas tablas. En paralelo un
 * archivo le borra las filas a otro y los fallos salen aleatorios, que es la
 * peor clase de test roto.
 */
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
    },
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
