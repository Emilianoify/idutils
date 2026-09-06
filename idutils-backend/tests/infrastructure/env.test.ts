import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/infrastructure/config/env.js'

const validEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/idutils',
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  ALLOWED_ORIGINS: 'https://app.example.com',
  COOKIE_SECURE: 'true',
  TRUST_PROXY_HOPS: '1',
}

describe('production environment safety', () => {
  it('accepts secure cookies behind the declared trusted proxy', () => {
    const environment = loadEnv(validEnvironment)

    expect(environment.COOKIE_SECURE).toBe(true)
    expect(environment.TRUST_PROXY_HOPS).toBe(1)
  })

  it('rejects insecure cookies in production', () => {
    expect(() => loadEnv({ ...validEnvironment, COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE tiene que ser "true" en producción/,
    )
  })

  it('rejects production without a trusted TLS proxy hop', () => {
    expect(() => loadEnv({ ...validEnvironment, TRUST_PROXY_HOPS: '0' })).toThrow(
      /TRUST_PROXY_HOPS tiene que ser al menos 1 en producción/,
    )
  })

  it('preserves explicit insecure localhost development', () => {
    const environment = loadEnv({
      ...validEnvironment,
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '0',
    })

    expect(environment.COOKIE_SECURE).toBe(false)
  })
})
