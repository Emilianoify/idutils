import { describe, expect, it } from 'vitest'
import { ABSENT, formatDateOnly, toDateInputValue } from '@/lib/format/dateOnly'

/**
 * El bug que este archivo existe para impedir.
 *
 * El backend serializa las fechas del dominio como medianoche UTC. Formatearlas
 * con `new Date(iso).toLocaleDateString()` en Argentina (UTC-3) las corre un día
 * para atrás: el episodio que arrancó el 6 se muestra el 5. Es invisible en un
 * servidor en UTC y aparece recién en la máquina de la coordinación.
 */

describe('formatDateOnly', () => {
  it('does not shift the day for a UTC midnight date', () => {
    expect(formatDateOnly('2026-09-06T00:00:00.000Z')).toBe('06/09/2026')
  })

  it('keeps the first of the month on the first of the month', () => {
    // El caso que más duele: un corrimiento acá cambia también el mes.
    expect(formatDateOnly('2026-01-01T00:00:00.000Z')).toBe('01/01/2026')
  })

  it('shows the absence marker when there is no date', () => {
    expect(formatDateOnly(null)).toBe(ABSENT)
  })

  it('does not invent a date out of an unparseable value', () => {
    expect(formatDateOnly('no es una fecha')).toBe(ABSENT)
  })
})

describe('toDateInputValue', () => {
  it('yields what an <input type="date"> expects', () => {
    expect(toDateInputValue('2026-09-06T00:00:00.000Z')).toBe('2026-09-06')
  })
})
