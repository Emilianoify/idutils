/**
 * Prestaciones y frecuencias, espejo del backend.
 *
 * `ServiceUnit` y `FrequencyUnit` son columnas de `schema.prisma`. Están
 * duplicadas a mano porque el contrato entre frontend y backend es HTTP: si el
 * backend agrega un valor, los `Record` exhaustivos de abajo NO COMPILAN hasta
 * que alguien decida cómo se lee.
 */

/** El sustantivo con el que se cuenta la prestación. Lo define la ESPECIALIDAD. */
export const ServiceUnit = {
  VISITA: 'VISITA',
  SESION: 'SESION',
  HORA: 'HORA',
} as const

export type ServiceUnit = (typeof ServiceUnit)[keyof typeof ServiceUnit]

/** Cada cuánto. Matemática pura, sin sustantivo. */
export const FrequencyUnit = {
  SEMANAL: 'SEMANAL',
  MENSUAL: 'MENSUAL',
} as const

export type FrequencyUnit = (typeof FrequencyUnit)[keyof typeof FrequencyUnit]

/** `Pérez, Ana` o solo el apellido. El apellido primero: es por donde se busca. */
export function professionalName(professional: {
  lastName: string
  firstName: string | null
}): string {
  return professional.firstName === null || professional.firstName.length === 0
    ? professional.lastName
    : `${professional.lastName}, ${professional.firstName}`
}
