import type { SessionClaims } from '../../../domain/repositories/ITokenService.js'

/**
 * `req.auth` lo pone el middleware `authenticate` y NADIE mas.
 *
 * Es opcional en el tipo a proposito, aunque en una ruta protegida siempre
 * este: si fuera obligatorio, un controller de una ruta publica lo leeria como
 * si existiera y el `undefined` explotaria en runtime. El tipo obliga a
 * chequear, que es exactamente lo que hay que hacer.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: SessionClaims
    }
  }
}

export {}
