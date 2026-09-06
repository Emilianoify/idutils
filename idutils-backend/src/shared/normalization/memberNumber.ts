/**
 * Normalizacion del numero de afiliado. UN SOLO LUGAR (D8, modelo-core).
 *
 * La misma afiliacion llega escrita de cinco formas: `00123456`, `123.456`,
 * `123-456`, `123 456`, `123456 `. Si el sistema las guarda distinto, el
 * indice unico parcial de `affiliations` deja de servir para nada y el
 * paciente termina duplicado, que es exactamente el problema del Excel.
 *
 * Si esta funcion se copia en la capa de import, en el controller y en el
 * seed, dentro de tres meses van a estar desincronizadas y el bug va a
 * aparecer como "a veces duplica". Se importa desde aca o no se normaliza.
 */

/** Se conservan letras y digitos. Todo separador se descarta. */
const SEPARATORS = /[\s.\-/_]/g

/** Error de dato, no de programa: lo dispara una carga, no un bug. */
export class InvalidMemberNumberError extends Error {
  constructor(raw: string) {
    super(`El numero de afiliado no tiene ningun caracter util: "${raw}"`)
    this.name = 'InvalidMemberNumberError'
  }
}

/**
 * Devuelve la forma canonica del numero de afiliado.
 *
 * Reglas, en orden:
 *  1. Se descartan espacios, puntos, guiones, barras y guiones bajos.
 *  2. Se pasa a mayusculas (hay obras sociales con sufijo alfabetico).
 *  3. Se quitan los ceros a la izquierda, salvo que el numero sea todo ceros:
 *     ahi queda `0`, porque devolver cadena vacia perderia el dato.
 *
 * @throws {InvalidMemberNumberError} si no queda ningun caracter.
 */
export function normalizeMemberNumber(raw: string): string {
  const compact = raw.replace(SEPARATORS, '').toUpperCase()

  if (compact.length === 0) {
    throw new InvalidMemberNumberError(raw)
  }

  const withoutLeadingZeros = compact.replace(/^0+/, '')

  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0'
}

/**
 * Comparacion por forma canonica. Existe para que nadie escriba
 * `a.memberNumber === b.memberNumber` sobre valores sin normalizar.
 */
export function isSameMemberNumber(a: string, b: string): boolean {
  return normalizeMemberNumber(a) === normalizeMemberNumber(b)
}
