/**
 * Las fechas del dominio se muestran SIN pasar por `new Date()`.
 *
 * El backend guarda nacimiento, alta de afiliación e inicio de episodio como
 * medianoche UTC y las serializa `2026-09-06T00:00:00.000Z`. Construir un
 * `Date` con eso y formatearlo con el huso local las corre un día para atrás en
 * Argentina (UTC-3): el episodio que arrancó el 6 se muestra el 5.
 *
 * Por eso acá no hay ningún `Date`: se recorta la parte de fecha del string y
 * se reordena. Es la misma disciplina que `dateOnlySchema` del backend, que
 * tampoco usa `z.coerce.date()`, y por exactamente el mismo motivo.
 */

/** Lo que se muestra cuando el dato no está cargado. */
export const ABSENT = '—'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/

/** `2026-09-06T00:00:00.000Z` -> `2026-09-06`. Lo que espera un `<input type="date">`. */
export function toDateInputValue(iso: string): string {
  return ISO_DATE.exec(iso)?.[0] ?? ''
}

/** `2026-09-06T00:00:00.000Z` -> `06/09/2026`. */
export function formatDateOnly(iso: string | null): string {
  if (iso === null) return ABSENT

  const parts = ISO_DATE.exec(iso)
  const year = parts?.[1]
  const month = parts?.[2]
  const day = parts?.[3]

  if (year === undefined || month === undefined || day === undefined) return ABSENT

  return `${day}/${month}/${year}`
}
