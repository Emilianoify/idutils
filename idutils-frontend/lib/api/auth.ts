import { z } from 'zod'
import { apiFetch } from './client'
import {
  emptySuccessEnvelopeSchema,
  sessionEnvelopeSchema,
  userSchema,
} from './responseSchemas'

/**
 * Sesión.
 *
 * No hay ningún token acá adentro, y es a propósito: el backend los pone en
 * cookies `httpOnly`, que el JavaScript de esta página no puede leer ni aunque
 * quiera. Lo único que viaja al frontend es quién sos.
 */

export const roleSchema = z.enum(['ADMIN', 'OPERADOR', 'LECTOR'])
export type Role = z.infer<typeof roleSchema>

export type User = z.infer<typeof userSchema>

export interface Credentials {
  email: string
  password: string
}

/**
 * Se valida la respuesta con Zod en vez de castearla.
 *
 * Un `as User` acepta cualquier cosa que llegue por la red y el problema
 * explota tres componentes más adentro, con un mensaje que no nombra la causa.
 * Acá falla en el borde, que es donde se puede decir algo útil.
 */
export async function login(credentials: Credentials): Promise<User> {
  const response = await apiFetch(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(credentials),
    },
    sessionEnvelopeSchema.parse,
  )

  return response.data
}

export async function logout(): Promise<void> {
  await apiFetch(
    '/api/auth/logout',
    { method: 'POST' },
    emptySuccessEnvelopeSchema.parse,
  )
}

export async function currentUser(): Promise<User> {
  const response = await apiFetch('/api/auth/me', {}, sessionEnvelopeSchema.parse)
  return response.data
}
