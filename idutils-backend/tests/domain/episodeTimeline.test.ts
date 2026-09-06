import { describe, expect, it } from 'vitest'
import {
  effectiveCareDays,
  hospitalizationPeriods,
  interruptionCount,
} from '../../src/domain/services/episodeTimeline.js'
import { daysBetweenDateOnly } from '../../src/shared/helpers/dateOnly.js'
import { d, episode } from '../helpers/factories.js'

/** Cuatro episodios de atencion domiciliaria interrumpidos por tres internaciones. */
const juanPerez = [
  episode({
    startsOn: '2026-01-01',
    endsOn: '2026-01-18',
    closeReason: 'INTERNACION',
    closeNote: 'Sanatorio Anchorena',
  }),
  episode({ startsOn: '2026-01-22', endsOn: '2026-07-01', closeReason: 'INTERNACION' }),
  episode({ startsOn: '2026-07-15', endsOn: '2026-08-25', closeReason: 'INTERNACION' }),
  episode({ startsOn: '2026-08-27' }),
]

describe('hospitalizationPeriods', () => {
  it('la internacion no se guarda: es el hueco entre dos episodios', () => {
    const periods = hospitalizationPeriods(juanPerez)

    expect(periods).toHaveLength(3)
    expect(periods[0]).toMatchObject({
      from: d('2026-01-18'),
      to: d('2026-01-22'),
      days: 4,
      note: 'Sanatorio Anchorena',
    })
    expect(periods[1]).toMatchObject({ from: d('2026-07-01'), to: d('2026-07-15'), days: 14 })
    expect(periods[2]).toMatchObject({ from: d('2026-08-25'), to: d('2026-08-27'), days: 2 })
  })

  it('una internacion en curso no tiene fecha de vuelta ni la inventa', () => {
    // No existe "fecha estimada de retorno": nadie sabe cuando vuelve, se
    // llenaria con inventos y la lista se pudre.
    const enCurso = [
      episode({ startsOn: '2026-01-01', endsOn: '2026-08-25', closeReason: 'INTERNACION' }),
    ]

    const periods = hospitalizationPeriods(enCurso)

    expect(periods).toHaveLength(1)
    expect(periods[0]?.to).toBeNull()
    expect(periods[0]?.days).toBeNull()
  })

  it('un cierre que no es internacion no abre un hueco de internacion', () => {
    // El motivo de cierre es lo que califica el hueco: sin el, un hueco podria
    // ser una internacion, una baja o un cambio de obra social.
    const altaYReingreso = [
      episode({ startsOn: '2026-01-01', endsOn: '2026-03-01', closeReason: 'ALTA_MEDICA' }),
      episode({ startsOn: '2026-06-01' }),
    ]

    expect(hospitalizationPeriods(altaYReingreso)).toHaveLength(0)
  })

  it('cuenta las interrupciones del ano', () => {
    expect(interruptionCount(juanPerez)).toBe(3)
  })
})

describe('effectiveCareDays', () => {
  const rango = { from: d('2026-01-01'), to: d('2026-08-28') }

  it('los dias de ID no son hasta menos desde', () => {
    // Este es el numero que el Excel no puede calcular y el que se discute al
    // facturar. La diferencia son exactamente los dias internado.
    const corridos = daysBetweenDateOnly(rango.from, d('2026-08-29'))
    const efectivos = effectiveCareDays(juanPerez, rango)

    expect(corridos).toBe(240)
    expect(efectivos).toBe(220)

    const internado = hospitalizationPeriods(juanPerez).reduce(
      (total, period) => total + (period.days ?? 0),
      0,
    )
    expect(efectivos + internado).toBe(corridos)
  })

  it('recorta los episodios que exceden el rango por cualquiera de los dos lados', () => {
    const episodes = [episode({ startsOn: '2025-11-01', endsOn: '2026-03-01', closeReason: 'ALTA_MEDICA' })]

    // Solo cuenta enero y febrero: 31 + 28.
    expect(effectiveCareDays(episodes, { from: d('2026-01-01'), to: d('2026-02-28') })).toBe(59)
  })

  it('un episodio fuera del rango no suma nada', () => {
    const episodes = [episode({ startsOn: '2025-01-01', endsOn: '2025-06-01', closeReason: 'ALTA_MEDICA' })]

    expect(effectiveCareDays(episodes, rango)).toBe(0)
  })

  it('un rango de un solo dia con el paciente activo cuenta ese dia', () => {
    const episodes = [episode({ startsOn: '2026-08-01' })]

    expect(effectiveCareDays(episodes, { from: d('2026-08-28'), to: d('2026-08-28') })).toBe(1)
  })

  it('rechaza un rango que termina antes de empezar', () => {
    expect(() =>
      effectiveCareDays(juanPerez, { from: d('2026-08-28'), to: d('2026-01-01') }),
    ).toThrow(RangeError)
  })
})
