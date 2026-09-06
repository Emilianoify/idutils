import { describe, expect, it } from 'vitest'
import {
  translatePrismaError,
  withDomainErrors,
} from '../../src/infrastructure/database/prismaErrors.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'
import { AppError } from '../../src/shared/errors/AppError.js'

/**
 * Estos tests son el contrato entre `core_invariants.sql` y el mensaje que ve
 * el operador.
 *
 * Las reglas del core viven en la BASE a proposito, y el precio de esa decision
 * es que el error llega escrito por Postgres. Si esta traduccion se rompe, el
 * sistema sigue siendo correcto y se vuelve inusable: nadie sabe que corregir
 * cuando la pantalla dice "violates exclusion constraint".
 */

/** Un error de Prisma como llega en la practica: codigo, meta y mensaje. */
function prismaError(options: {
  code?: string
  message?: string
  meta?: Record<string, unknown>
  cause?: unknown
}): Error {
  const error = new Error(options.message ?? 'Invalid `prisma.query()` invocation')
  return Object.assign(error, {
    code: options.code,
    meta: options.meta,
    cause: options.cause,
  })
}

describe('translatePrismaError', () => {
  it('traduce el EXCLUDE de episodios solapados a un mensaje sobre las fechas', () => {
    const error = prismaError({
      code: 'P2010',
      message:
        'conflicting key value violates exclusion constraint "no_overlapping_episodes"',
    })

    const translated = translatePrismaError(error)

    expect(translated?.statusCode).toBe(409)
    expect(translated?.message).toBe(ERROR_MESSAGES.EPISODE.OVERLAPS)
  })

  it('traduce el unique parcial de afiliacion vigente al mensaje que dice que hacer', () => {
    // Prisma no modela indices parciales creados a mano: el nombre llega en
    // `meta.target`, no en el mensaje.
    const error = prismaError({
      code: 'P2002',
      meta: { target: ['affiliations_current_member_number_key'] },
    })

    const translated = translatePrismaError(error)

    expect(translated?.statusCode).toBe(409)
    expect(translated?.message).toBe(ERROR_MESSAGES.AFFILIATION.ALREADY_TAKEN)
  })

  it('traduce el unique parcial de prestacion activa', () => {
    const error = prismaError({
      code: 'P2002',
      meta: { target: 'care_services_active_key' },
    })

    expect(translatePrismaError(error)?.message).toBe(ERROR_MESSAGES.CARE_SERVICE.DUPLICATED)
  })

  it('traduce el unico contacto principal por paciente', () => {
    const error = prismaError({
      code: 'P2002',
      meta: { target: ['patient_contacts_single_primary_key'] },
    })

    expect(translatePrismaError(error)?.message).toBe(
      ERROR_MESSAGES.PATIENT.PRIMARY_CONTACT_TAKEN,
    )
  })

  it('encuentra el nombre de la constraint aunque venga en la cadena de causas', () => {
    // El driver envuelve el error de pg, y Prisma envuelve al driver. Buscar en
    // un solo nivel funciona hasta el dia que no.
    const error = prismaError({
      message: 'Error occurred during query execution',
      cause: prismaError({
        message: 'new row violates check constraint "authorization_valid_period"',
      }),
    })

    const translated = translatePrismaError(error)

    expect(translated?.statusCode).toBe(400)
    expect(translated?.message).toBe(ERROR_MESSAGES.AUTHORIZATION.PERIODO_INVALIDO)
  })

  it('cae al codigo de Prisma cuando la constraint no es una del core', () => {
    const error = prismaError({ code: 'P2003', message: 'Foreign key constraint failed' })

    const translated = translatePrismaError(error)

    expect(translated?.statusCode).toBe(409)
    expect(translated?.message).toBe(ERROR_MESSAGES.DATABASE.REFERENCE_NOT_FOUND)
  })

  it('traduce el registro inexistente a un 404', () => {
    expect(translatePrismaError(prismaError({ code: 'P2025' }))?.statusCode).toBe(404)
  })

  it('devuelve null para lo que no viene de la base', () => {
    // Un bug de la aplicacion disfrazado de 409 es el que nadie encuentra,
    // porque la pantalla muestra un mensaje razonable.
    expect(translatePrismaError(new TypeError('x is not a function'))).toBeNull()
    expect(translatePrismaError('un string suelto')).toBeNull()
    expect(translatePrismaError(null)).toBeNull()
  })
})

describe('withDomainErrors', () => {
  it('deja pasar el resultado cuando no hay error', async () => {
    await expect(withDomainErrors(async () => 42)).resolves.toBe(42)
  })

  it('convierte la violacion de la base en AppError', async () => {
    const failing = async (): Promise<never> => {
      throw prismaError({
        code: 'P2002',
        meta: { target: ['users_email_key'] },
      })
    }

    await expect(withDomainErrors(failing)).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 409,
      message: ERROR_MESSAGES.DATABASE.EMAIL_TAKEN,
    })
  })

  it('no toca un AppError que ya venia del dominio', async () => {
    const original = new AppError(404, ERROR_MESSAGES.PATIENT.NOT_FOUND)

    await expect(
      withDomainErrors(async () => {
        throw original
      }),
    ).rejects.toBe(original)
  })

  it('no toca un error que no es de la base', async () => {
    const bug = new TypeError('undefined no tiene .map')

    await expect(
      withDomainErrors(async () => {
        throw bug
      }),
    ).rejects.toBe(bug)
  })
})
