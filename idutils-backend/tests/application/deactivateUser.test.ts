import { describe, expect, it } from 'vitest'
import { DeactivateUserUseCase } from '../../src/application/useCases/user/deactivateUserUseCase.js'
import type { User } from '../../src/domain/entities/userEntity.js'
import {
  type IUserRepository,
  UserDeactivationResult,
} from '../../src/domain/repositories/IUserRepository.js'
import { Role } from '../../src/generated/prisma/enums.js'
import { ERROR_MESSAGES } from '../../src/shared/constants/messages.js'

/**
 * Las dos reglas de la baja de usuario, probadas donde viven.
 *
 * La de "último administrador" es INALCANZABLE por HTTP en el camino feliz: el
 * que pide la baja tiene que ser ADMIN activo, así que siempre queda él. Se
 * alcanza en el borde real —un admin al que acaban de dar de baja pero cuyo
 * access token todavía no venció— y se alcanzaría desde un comando de consola.
 *
 * Que sea difícil de alcanzar no la hace innecesaria: es la que impide llegar a
 * un sistema sin nadie que lo administre, y de ese estado sólo se sale entrando
 * a la base a mano.
 */

const EPOCH = new Date('2026-01-01T00:00:00.000Z')

function user(overrides: Partial<User> & Pick<User, 'id' | 'role'>): User {
  return {
    email: `${overrides.id}@idutils.local`,
    passwordHash: 'hash',
    name: 'Usuario',
    active: true,
    tokenVersion: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
    ...overrides,
  }
}

function repositoryWith(users: User[]): IUserRepository & { deactivated: string[] } {
  const deactivated: string[] = []

  return {
    deactivated,
    async findById(id) {
      return users.find((candidate) => candidate.id === id) ?? null
    },
    async findByEmailForAuthentication() {
      throw new Error('no se usa en este caso de uso')
    },
    async listActive() {
      return users.filter((candidate) => candidate.active)
    },
    async create() {
      throw new Error('no se usa en este caso de uso')
    },
    async changePassword() {
      throw new Error('no se usa en este caso de uso')
    },
    async deactivateSafely(id) {
      const candidate = users.find((user) => user.id === id && user.deletedAt === null)
      if (candidate === undefined) return UserDeactivationResult.NOT_FOUND
      if (!candidate.active) return UserDeactivationResult.ALREADY_INACTIVE

      const activeAdmins = users.filter(
        (user) => user.active && user.deletedAt === null && user.role === Role.ADMIN,
      )
      if (candidate.role === Role.ADMIN && activeAdmins.length <= 1) {
        return UserDeactivationResult.LAST_ADMIN
      }

      candidate.active = false
      candidate.tokenVersion += 1
      deactivated.push(id)
      return UserDeactivationResult.DEACTIVATED
    },
  }
}

describe('DeactivateUserUseCase', () => {
  it('da de baja a un operador y no toca a nadie más', async () => {
    const repository = repositoryWith([
      user({ id: 'admin', role: 'ADMIN' }),
      user({ id: 'operador', role: 'OPERADOR' }),
    ])

    await new DeactivateUserUseCase(repository).execute('operador', 'admin')

    expect(repository.deactivated).toEqual(['operador'])
  })

  it('no deja que alguien se dé de baja a sí mismo', async () => {
    const repository = repositoryWith([user({ id: 'admin', role: 'ADMIN' })])

    // Quedaría afuera en el acto, y si además era el único ADMIN, el sistema
    // se queda sin quien lo arregle.
    await expect(
      new DeactivateUserUseCase(repository).execute('admin', 'admin'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.USER.CANNOT_DEACTIVATE_SELF,
    })

    expect(repository.deactivated).toEqual([])
  })

  it('no deja el sistema sin ningún administrador activo', async () => {
    // El que pide ya está dado de baja: su access token todavía no venció.
    const repository = repositoryWith([
      user({ id: 'admin-saliente', role: 'ADMIN', active: false }),
      user({ id: 'unico-admin', role: 'ADMIN' }),
    ])

    await expect(
      new DeactivateUserUseCase(repository).execute('unico-admin', 'admin-saliente'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.USER.LAST_ADMIN,
    })

    expect(repository.deactivated).toEqual([])
  })

  it('sí deja dar de baja a un admin cuando queda otro activo', async () => {
    const repository = repositoryWith([
      user({ id: 'admin-a', role: 'ADMIN' }),
      user({ id: 'admin-b', role: 'ADMIN' }),
    ])

    await new DeactivateUserUseCase(repository).execute('admin-b', 'admin-a')

    expect(repository.deactivated).toEqual(['admin-b'])
  })

  it('rechaza dar de baja dos veces al mismo', async () => {
    const repository = repositoryWith([
      user({ id: 'admin', role: 'ADMIN' }),
      user({ id: 'baja', role: 'OPERADOR', active: false }),
    ])

    await expect(
      new DeactivateUserUseCase(repository).execute('baja', 'admin'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ERROR_MESSAGES.USER.ALREADY_INACTIVE,
    })
  })
})
