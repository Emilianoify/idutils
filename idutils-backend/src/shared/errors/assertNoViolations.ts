import { AppError } from './AppError.js'

/**
 * Traduce las violaciones que devuelve el dominio a un `AppError`.
 *
 * El dominio devuelve TODAS las violaciones y no la primera, para que el
 * formulario pueda mostrarlas juntas. Este helper conserva esa propiedad: el
 * `message` es la primera para el que solo lee una linea, y `details` las trae
 * todas para el que arma la pantalla.
 *
 * Existe como funcion y no copiado en cada caso de uso porque el mapeo
 * violacion -> mensaje es exactamente donde se cuela un `as` que despues
 * esconde un enum sin traducir.
 */
export function assertNoViolations<Violation extends string>(
  violations: readonly Violation[],
  messages: Record<Violation, string>,
  statusCode = 409,
): void {
  if (violations.length === 0) return

  const texts = violations.map((violation) => messages[violation])
  const [first] = texts

  throw new AppError(statusCode, first ?? 'Los datos no son válidos', texts)
}
