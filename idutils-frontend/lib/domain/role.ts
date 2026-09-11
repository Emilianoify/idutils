/**
 * Los tres roles del sistema, espejo de `Role` del backend (`schema.prisma`).
 *
 * Está duplicado a propósito y no compartido por un paquete: el frontend habla
 * con la API por HTTP, y este es el contrato de esa conversación. Si el backend
 * agrega un rol, esto NO COMPILA hasta que alguien decida qué puede hacer y qué
 * ve. Un `string` suelto se lo tragaría en silencio.
 *
 * Los valores quedan en mayúsculas porque son los mismos strings que manda el
 * backend, no una traducción.
 */
export const Role = {
  /** Todo: además de leer y escribir, administra usuarios y catálogos. */
  ADMIN: 'ADMIN',
  /** Lectura y escritura sobre pacientes, episodios y autorizaciones. */
  OPERADOR: 'OPERADOR',
  /** Solo lectura. Nunca escribe. */
  LECTOR: 'LECTOR',
} as const

export type Role = (typeof Role)[keyof typeof Role]
