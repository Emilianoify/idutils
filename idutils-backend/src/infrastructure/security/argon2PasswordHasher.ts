import argon2 from 'argon2'
import type { IPasswordHasher } from '../../domain/repositories/IPasswordHasher.js'

/**
 * argon2id: el que recomienda OWASP para contrasenas.
 *
 * Los parametros se fijan aca y no se dejan por defecto para que sean
 * VISIBLES: el dia que haya que subirlos porque el hardware mejoro, se cambian
 * en un lugar y se sabe donde mirar.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export class Argon2PasswordHasher implements IPasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, OPTIONS)
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword)
    } catch {
      // Un hash corrupto o con otro formato no es "contrasena correcta". Se
      // devuelve false y no se propaga: dejar salir el error convertiria una
      // fila mal migrada en un 500 en la pantalla de login.
      return false
    }
  }
}
