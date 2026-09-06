import { describe, expect, it } from 'vitest'
import { formatFrequency } from '../../src/domain/services/frequencyLabel.js'

describe('formatFrequency', () => {
  it('la misma fila se lee distinto segun la especialidad', () => {
    // El punto entero de D11: `2 semanales` es UNA fila del catalogo. El
    // sustantivo lo pone la especialidad, no la frecuencia.
    const dosSemanales = { amount: 2, unit: 'SEMANAL' } as const

    expect(formatFrequency(dosSemanales, 'VISITA')).toBe('2 visitas semanales')
    expect(formatFrequency(dosSemanales, 'SESION')).toBe('2 sesiones semanales')
    expect(formatFrequency(dosSemanales, 'HORA')).toBe('2 horas semanales')
  })

  it('concuerda en singular', () => {
    expect(formatFrequency({ amount: 1, unit: 'MENSUAL' }, 'SESION')).toBe('1 sesión mensual')
    expect(formatFrequency({ amount: 1, unit: 'SEMANAL' }, 'VISITA')).toBe('1 visita semanal')
  })

  it('soporta enfermeria por turnos sin tocar ninguna frecuencia', () => {
    // El dia que aparezca enfermeria de guardia, se agrega HORA al enum de la
    // especialidad y el catalogo de frecuencias no se toca.
    expect(formatFrequency({ amount: 24, unit: 'SEMANAL' }, 'HORA')).toBe('24 horas semanales')
  })

  it('lee igual el valor congelado de una autorizacion vieja', () => {
    // Misma funcion para el catalogo de hoy y para lo que se autorizo en
    // agosto: dos renderizadores se desincronizan.
    const congelada = { amount: 10, unit: 'MENSUAL' } as const

    expect(formatFrequency(congelada, 'VISITA')).toBe('10 visitas mensuales')
  })
})
