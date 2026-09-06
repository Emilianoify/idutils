import { resolveApiBaseUrl } from '@/config/apiUrl'
import { errorEnvelopeSchema, sessionEnvelopeSchema } from './responseSchemas'

const BASE_URL = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NODE_ENV,
)

type ResponseParser<T> = (body: unknown) => T

interface RefreshFlight {
  generation: number
  promise: Promise<void>
}

let refreshGeneration = 0
let latestRefresh: RefreshFlight | null = null

const AUTH_ENDPOINTS_WITHOUT_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
])

/**
 * Un error que ya viene redactado para el operador.
 *
 * El backend contesta siempre con la misma forma —`{ message, details? }`— y
 * esos textos están escritos para que se entienda QUÉ HACER, no para describir
 * el estado interno del sistema. Así que el frontend los muestra tal cual: no
 * los traduce, no los reescribe y no inventa uno propio.
 *
 * `details` trae TODAS las violaciones, no la primera. Es lo que permite que un
 * formulario marque los tres campos juntos en vez de uno por intento.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(body)
  if (!parsed.success) {
    return new ApiError(status, 'No se pudo completar la operación')
  }

  return new ApiError(
    status,
    parsed.data.message,
    parsed.data.details ?? [],
  )
}

/**
 * Toda llamada a la API pasa por acá.
 *
 * `credentials: 'include'` es lo que hace que viaje la cookie de sesión, y no
 * es opcional: sin eso el navegador manda la request pelada y la API contesta
 * 401 aunque haya sesión abierta. Va en el cliente y no en cada llamada
 * justamente para que no se pueda olvidar.
 */
async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
  } catch {
    // La API no contestó: está caída, mal configurada o CORS la bloqueó. No es
    // culpa de lo que escribió el operador, y el mensaje tiene que decirlo.
    throw new ApiError(
      0,
      'No se pudo contactar al servidor. Revisá que esté funcionando',
    )
  }

  return response
}

async function parseResponse<T>(
  response: Response,
  parser: ResponseParser<T> | undefined,
): Promise<T | void> {
  if (response.status === 204) {
    if (parser !== undefined) {
      throw new ApiError(204, 'El servidor no devolvió los datos esperados')
    }
    return
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw toApiError(response.status, body)
  }

  if (parser === undefined) return
  return parser(body)
}

function canRefresh(path: string): boolean {
  const pathname = new URL(path, BASE_URL).pathname
  return !AUTH_ENDPOINTS_WITHOUT_REFRESH.has(pathname)
}

function refreshSession(requestGeneration: number): Promise<void> {
  if (refreshGeneration === requestGeneration) {
    refreshGeneration += 1
    const generation = refreshGeneration
    const promise = request('/api/auth/refresh', { method: 'POST' })
      .then((response) => parseResponse(response, sessionEnvelopeSchema.parse))
      .then(() => undefined)

    latestRefresh = { generation, promise }
  }

  const flight = latestRefresh
  if (flight === null || flight.generation <= requestGeneration) {
    return Promise.reject(new ApiError(401, 'Tu sesión venció. Iniciá sesión de nuevo'))
  }

  return flight.promise
}

export function apiFetch(path: string, init?: RequestInit): Promise<void>
export function apiFetch<T>(
  path: string,
  init: RequestInit,
  parser: ResponseParser<T>,
): Promise<T>
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  parser?: ResponseParser<T>,
): Promise<T | void> {
  const requestGeneration = refreshGeneration
  let response = await request(path, init)

  if (response.status === 401 && canRefresh(path)) {
    await refreshSession(requestGeneration)
    response = await request(path, init)
  }

  return parseResponse(response, parser)
}
