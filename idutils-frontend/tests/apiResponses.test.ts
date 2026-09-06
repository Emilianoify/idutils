import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { resolveApiBaseUrl } from '@/config/apiUrl'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('network response validation', () => {
  it('rejects an auth response that does not match the shared envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ user: { id: 'legacy' } }), { status: 200 })),
    )
    const { login } = await import('@/lib/api/auth')

    await expect(login({ email: 'a@example.com', password: 'password' })).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects an invalid dashboard response at the network boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, message: 'ok', data: {} }), { status: 200 })),
    )
    const { getDashboard } = await import('@/lib/api/dashboard')

    await expect(getDashboard()).rejects.toBeInstanceOf(ZodError)
  })
})

describe('API URL configuration', () => {
  it('fails outside development when NEXT_PUBLIC_API_URL is missing', () => {
    expect(() => resolveApiBaseUrl(undefined, 'production')).toThrow(/NEXT_PUBLIC_API_URL is required/)
  })

  it('uses localhost only for explicit development', () => {
    expect(resolveApiBaseUrl(undefined, 'development')).toBe('http://localhost:4000')
  })

  it('fails while loading the production build configuration when the URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')

    await expect(import('@/next.config')).rejects.toThrow(/NEXT_PUBLIC_API_URL is required/)
  })
})
