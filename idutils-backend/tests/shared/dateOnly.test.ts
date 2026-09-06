import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetweenDateOnly,
  parseDateOnly,
  timestampToBusinessDate,
  toDateOnlyString,
} from '../../src/shared/helpers/dateOnly.js'

describe('parseDateOnly', () => {
  it('construye la fecha a medianoche UTC', () => {
    const date = parseDateOnly('2026-08-28')

    expect(date.toISOString()).toBe('2026-08-28T00:00:00.000Z')
    expect(toDateOnlyString(date)).toBe('2026-08-28')
  })

  it('rechaza fechas que no existen en vez de correrlas al mes siguiente', () => {
    // `new Date('2026-02-31')` no explota: da el 3 de marzo. Asi es como un
    // episodio arranca en un mes equivocado sin que nadie se entere.
    expect(() => parseDateOnly('2026-02-31')).toThrow(RangeError)
    expect(() => parseDateOnly('2026-13-01')).toThrow(RangeError)
  })

  it('rechaza cualquier formato que no sea YYYY-MM-DD', () => {
    expect(() => parseDateOnly('28/08/2026')).toThrow(RangeError)
    expect(() => parseDateOnly('2026-8-28')).toThrow(RangeError)
    expect(() => parseDateOnly('')).toThrow(RangeError)
  })
})

describe('timestampToBusinessDate', () => {
  it('un cron de madrugada UTC no adelanta el dia de la coordinacion', () => {
    // 2026-08-29T01:00Z todavia es 28 de agosto en Buenos Aires. Si el
    // dashboard usara la fecha del servidor, mostraria vencimientos de manana.
    const madrugadaUtc = new Date('2026-08-29T01:00:00.000Z')

    expect(toDateOnlyString(timestampToBusinessDate(madrugadaUtc))).toBe('2026-08-28')
  })

  it('despues del mediodia UTC ya coincide con el calendario de la pared', () => {
    const tarde = new Date('2026-08-28T15:00:00.000Z')

    expect(toDateOnlyString(timestampToBusinessDate(tarde))).toBe('2026-08-28')
  })
})

describe('aritmetica de dias', () => {
  it('cuenta dias enteros incluso cruzando el cambio de horario', () => {
    // Las fechas del dominio son medianoche UTC: no hay DST que meta un dia de
    // 23 horas y devuelva 0.99 dias redondeado para abajo.
    const desde = parseDateOnly('2026-01-01')
    const hasta = parseDateOnly('2026-12-31')

    expect(daysBetweenDateOnly(desde, hasta)).toBe(364)
  })

  it('addDays y daysBetween son inversas', () => {
    const base = parseDateOnly('2026-08-28')

    expect(toDateOnlyString(addDays(base, 30))).toBe('2026-09-27')
    expect(daysBetweenDateOnly(base, addDays(base, 30))).toBe(30)
  })

  it('devuelve negativo cuando la segunda fecha es anterior', () => {
    expect(daysBetweenDateOnly(parseDateOnly('2026-08-28'), parseDateOnly('2026-08-20'))).toBe(-8)
  })
})
