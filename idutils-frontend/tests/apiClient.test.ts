import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const envelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ value: z.number() }),
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sessionBody = {
  success: true,
  message: 'Sesión renovada',
  data: { id: '1', email: 'a@example.com', name: 'Ana', role: 'ADMIN' },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('apiFetch session recovery', () => {
  it('always includes browser credentials', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        json(200, { success: true, message: 'ok', data: { value: 1 } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await import('@/lib/api/client')

    await apiFetch('/api/dashboard', {}, envelopeSchema.parse)

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('shares one refresh across concurrent 401 responses', async () => {
    let refreshCalls = 0
    const attempts = new Map<string, number>()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      if (path === '/api/auth/refresh') {
        refreshCalls += 1
        return json(200, sessionBody)
      }

      const count = attempts.get(path) ?? 0
      attempts.set(path, count + 1)
      return count === 0
        ? json(401, { success: false, message: 'Tu sesión venció' })
        : json(200, { success: true, message: 'ok', data: { value: count } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await import('@/lib/api/client')

    const results = await Promise.all([
      apiFetch('/api/first', {}, envelopeSchema.parse),
      apiFetch('/api/second', {}, envelopeSchema.parse),
    ])

    expect(refreshCalls).toBe(1)
    expect(results.map((result) => result.data.value)).toEqual([1, 1])
  })

  it('retries an original request at most once', async () => {
    let ordinaryCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      if (path === '/api/auth/refresh') return json(200, sessionBody)
      ordinaryCalls += 1
      return json(401, { success: false, message: 'Tu sesión venció' })
    }))
    const { ApiError, apiFetch } = await import('@/lib/api/client')

    await expect(apiFetch('/api/dashboard', {}, envelopeSchema.parse)).rejects.toBeInstanceOf(ApiError)
    expect(ordinaryCalls).toBe(2)
  })

  it('does not retry the original request when refresh fails', async () => {
    let ordinaryCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      if (path === '/api/auth/refresh') {
        return json(401, { success: false, message: 'Iniciá sesión para continuar' })
      }
      ordinaryCalls += 1
      return json(401, { success: false, message: 'Tu sesión venció' })
    }))
    const { ApiError, apiFetch } = await import('@/lib/api/client')

    await expect(apiFetch('/api/dashboard', {}, envelopeSchema.parse)).rejects.toBeInstanceOf(ApiError)
    expect(ordinaryCalls).toBe(1)
  })

  it('does not refresh or retry non-authentication failures', async () => {
    const fetchMock = vi.fn(async () =>
      json(500, { success: false, message: 'Ocurrió un error inesperado' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await import('@/lib/api/client')

    await expect(apiFetch('/api/dashboard', {}, envelopeSchema.parse)).rejects.toMatchObject({
      status: 500,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'])(
    'never recursively refreshes %s',
    async (path) => {
      const fetchMock = vi.fn(async () => json(401, { success: false, message: 'No' }))
      vi.stubGlobal('fetch', fetchMock)
      const { apiFetch } = await import('@/lib/api/client')

      await expect(apiFetch(path, {}, envelopeSchema.parse)).rejects.toMatchObject({ status: 401 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects a 204 when an endpoint expects parsed data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    const { apiFetch } = await import('@/lib/api/client')

    await expect(apiFetch('/api/dashboard', {}, envelopeSchema.parse)).rejects.toMatchObject({
      status: 204,
    })
  })
})
