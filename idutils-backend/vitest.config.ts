import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
    },
    include: ['tests/**/*.test.ts'],
    // Los de integracion necesitan un Postgres migrado y corren aparte con
    // `pnpm test:integration`. `pnpm test` tiene que estar verde en cualquier
    // maquina sin preparar nada.
    exclude: ['tests/integration/**'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
