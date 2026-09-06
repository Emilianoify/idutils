/**
 * Fechas sin hora. Portado de auditoriasamanda porque el problema es el mismo
 * y ya costo caro una vez.
 *
 * Todo el dominio de IDUtils trabaja con fechas civiles: el episodio empieza
 * "el 22 de enero", la autorizacion vence "el 30 de septiembre". No hay hora,
 * y meter una es como se rompe esto: un `new Date('2026-01-22')` interpretado
 * en hora local con offset negativo da el 21 a las 21:00, y el episodio arranca
 * un dia antes en produccion y bien en la maquina del que lo programo.
 *
 * Regla: toda fecha del dominio es un Date a medianoche UTC. Se construye con
 * `parseDateOnly` y nunca con `new Date(string)`.
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

/** Milisegundos en un dia. Las fechas son medianoche UTC: no hay DST que corrija. */
const MS_PER_DAY = 86_400_000

/**
 * `YYYY-MM-DD` a medianoche UTC. Rechaza fechas que no existen (31 de febrero),
 * que es justo lo que `new Date` acepta corriendo al mes siguiente en silencio.
 */
export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new RangeError(`Fecha invalida, se esperaba YYYY-MM-DD: "${value}"`)
  }

  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Fecha invalida: "${value}"`)
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Esa fecha no existe: "${value}"`)
  }

  return parsed
}

export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Que dia era en Buenos Aires en ese instante. Un cron que corre 01:00 UTC ya
 * es "ayer" para la coordinacion, y el dashboard tiene que coincidir con el
 * calendario de la pared, no con el del servidor.
 */
export function timestampToBusinessDate(timestamp: Date): Date {
  if (Number.isNaN(timestamp.getTime())) {
    throw new RangeError('Timestamp invalido')
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new RangeError('No se pudo derivar la fecha de negocio')
  }

  return parseDateOnly(`${year}-${month}-${day}`)
}

/**
 * El "hoy" del dominio. Se inyecta a proposito: una funcion que llama a
 * `new Date()` adentro no se puede testear sin viajar en el tiempo.
 */
export function todayInBusinessTimeZone(now: Date = new Date()): Date {
  return timestampToBusinessDate(now)
}

/**
 * Normaliza lo que vuelve de la base. Postgres devuelve `date` como Date, pero
 * el driver puede traerlo con hora; esto lo recorta a medianoche UTC para que
 * las comparaciones del dominio sean por dia y no por milisegundo.
 */
export function normalizePersistedDateOnly(date: Date): Date {
  return parseDateOnly(toDateOnlyString(date))
}

/** Dias enteros de `a` a `b`. Negativo si `b` es anterior. */
export function daysBetweenDateOnly(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

/** Compara por dia, ignorando cualquier resto de hora. */
export function isSameDay(a: Date, b: Date): boolean {
  return toDateOnlyString(a) === toDateOnlyString(b)
}

export function isBeforeOrSame(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime()
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}
