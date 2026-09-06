import type { CookieOptions, Response } from 'express'
import type { SessionTokens } from '../../domain/repositories/ITokenService.js'

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'

/**
 * El refresh SOLO se manda a las rutas de auth.
 *
 * Con `path: '/'` el navegador adjuntaria el token de larga vida en TODAS las
 * llamadas —cada consulta al dashboard, cada busqueda— multiplicando por cien
 * las chances de que quede en un log intermedio. Aca viaja unicamente cuando
 * hace falta: al renovar y al cerrar sesion.
 */
const REFRESH_PATH = '/api/auth'

export interface CookieSettings {
  /** `true` solo detras de HTTPS. En HTTP plano el browser descarta la cookie. */
  secure: boolean
}

/**
 * `sameSite: 'strict'` es lo que reemplaza a un token CSRF.
 *
 * El navegador no manda estas cookies en un pedido originado por otro sitio, y
 * por eso una pagina maliciosa no puede disparar acciones en nombre del
 * operador aunque tenga la sesion abierta.
 */
function baseOptions(settings: CookieSettings): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'strict',
  }
}

/**
 * Escribe las dos cookies con la vida EXACTA de cada token.
 *
 * Los `maxAge` salen de `ITokenService` y no de constantes escritas aca: si la
 * cookie durara mas que el token, el frontend creeria tener sesion y comeria
 * 401; si durara menos, desloguearia a alguien con un token todavia valido. Los
 * dos sintomas se reportan igual —"a veces me saca"— y ninguno apunta al
 * verdadero problema.
 */
export function setSessionCookies(
  response: Response,
  tokens: SessionTokens,
  lifetimes: { accessTokenSeconds: number; refreshTokenSeconds: number },
  settings: CookieSettings,
): void {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(settings),
    maxAge: lifetimes.accessTokenSeconds * 1000,
    path: '/',
  })

  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(settings),
    maxAge: lifetimes.refreshTokenSeconds * 1000,
    path: REFRESH_PATH,
  })
}

/**
 * Borra las dos con EXACTAMENTE los mismos atributos con los que se pusieron.
 *
 * Un `clearCookie` con otro `path` no borra nada y no avisa: el navegador lo
 * trata como otra cookie. Por eso las dos rutas salen de la misma constante.
 */
export function clearSessionCookies(response: Response, settings: CookieSettings): void {
  response.clearCookie(ACCESS_COOKIE, { ...baseOptions(settings), path: '/' })
  response.clearCookie(REFRESH_COOKIE, { ...baseOptions(settings), path: REFRESH_PATH })
}
