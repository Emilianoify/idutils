import { describe, expect, it } from 'vitest'
import {
  InvalidMemberNumberError,
  isSameMemberNumber,
  normalizeMemberNumber,
} from '../../src/shared/normalization/memberNumber.js'

describe('normalizeMemberNumber', () => {
  it('descarta los separadores con los que llega el mismo numero', () => {
    const variants = ['123456', '123.456', '123-456', '123 456', '123/456', ' 123456 ']

    for (const variant of variants) {
      expect(normalizeMemberNumber(variant)).toBe('123456')
    }
  })

  it('quita los ceros a la izquierda', () => {
    expect(normalizeMemberNumber('00123456')).toBe('123456')
    expect(normalizeMemberNumber('0000123.456')).toBe('123456')
  })

  it('conserva un cero cuando el numero es todo ceros', () => {
    // Devolver cadena vacia perderia el dato y ademas romperia el indice unico.
    expect(normalizeMemberNumber('0000')).toBe('0')
  })

  it('normaliza el sufijo alfabetico a mayusculas', () => {
    expect(normalizeMemberNumber('123456-a')).toBe('123456A')
    expect(isSameMemberNumber('123456-a', '00123456 A')).toBe(true)
  })

  it('no colapsa numeros que son realmente distintos', () => {
    expect(isSameMemberNumber('123456', '1234567')).toBe(false)
    expect(isSameMemberNumber('123456A', '123456B')).toBe(false)
  })

  it('rechaza una entrada sin ningun caracter util', () => {
    expect(() => normalizeMemberNumber('   ---   ')).toThrow(InvalidMemberNumberError)
    expect(() => normalizeMemberNumber('')).toThrow(InvalidMemberNumberError)
  })
})
