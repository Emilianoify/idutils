import { describe, expect, it } from 'vitest'
import { LoginUseCase } from '../../src/application/useCases/auth/loginUseCase.js'
import { LogoutSessionUseCase } from '../../src/application/useCases/auth/logoutSessionUseCase.js'
import { RefreshSessionUseCase } from '../../src/application/useCases/auth/refreshSessionUseCase.js'
import type { User } from '../../src/domain/entities/userEntity.js'
import type {
  IRefreshSessionRepository,
  NewRefreshSession,
  RotateRefreshSessionCommand,
} from '../../src/domain/repositories/IRefreshSessionRepository.js'
import type { IUserRepository } from '../../src/domain/repositories/IUserRepository.js'
import { Role } from '../../src/generated/prisma/enums.js'
import { JwtTokenService } from '../../src/infrastructure/security/jwtTokenService.js'

const EPOCH = new Date('2026-01-01T00:00:00.000Z')
const PASSWORD = 'contraseña-de-prueba'

function createUser(): User {
  return {
    id: 'user-1',
    email: 'ana@idutils.local',
    passwordHash: 'hash',
    name: 'Ana',
    role: Role.OPERADOR,
    active: true,
    tokenVersion: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  }
}

function userRepository(user: User): IUserRepository {
  return {
    async findById(id) {
      return id === user.id ? user : null
    },
    async findByEmailForAuthentication(email) {
      return email === user.email ? user : null
    },
    async listActive() {
      return user.active ? [user] : []
    },
    async create() {
      throw new Error('not used')
    },
    async changePassword() {
      throw new Error('not used')
    },
    async deactivateSafely() {
      throw new Error('not used')
    },
  }
}

interface StoredSession extends NewRefreshSession {
  revoked: boolean
}

class MemoryRefreshSessions implements IRefreshSessionRepository {
  readonly sessions = new Map<string, StoredSession>()

  async create(session: NewRefreshSession): Promise<void> {
    this.sessions.set(session.id, { ...session, revoked: false })
  }

  async rotate(command: RotateRefreshSessionCommand): Promise<'rotated' | 'reused' | 'invalid'> {
    const session = this.sessions.get(command.sessionId)
    if (session === undefined || session.revoked || session.userId !== command.userId) {
      return 'invalid'
    }

    if (session.currentTokenId !== command.currentTokenId) {
      session.revoked = true
      return 'reused'
    }

    if (session.expiresAt <= command.now) return 'invalid'

    session.currentTokenId = command.nextTokenId
    session.expiresAt = command.expiresAt
    return 'rotated'
  }

  async revoke(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (session === undefined || session.revoked) return false
    session.revoked = true
    return true
  }
}

function harness(): {
  user: User
  sessions: MemoryRefreshSessions
  login: LoginUseCase
  refresh: RefreshSessionUseCase
  logout: LogoutSessionUseCase
} {
  const user = createUser()
  const users = userRepository(user)
  const sessions = new MemoryRefreshSessions()
  const tokens = new JwtTokenService('a'.repeat(48), 'b'.repeat(48))
  const passwordHasher = {
    async hash(): Promise<string> {
      return 'hash'
    },
    async verify(hash: string, password: string): Promise<boolean> {
      return hash === 'hash' && password === PASSWORD
    },
  }

  return {
    user,
    sessions,
    login: new LoginUseCase(users, passwordHasher, tokens, sessions),
    refresh: new RefreshSessionUseCase(users, tokens, sessions),
    logout: new LogoutSessionUseCase(tokens, sessions),
  }
}

async function signIn(setup: ReturnType<typeof harness>): Promise<string> {
  const result = await setup.login.execute({ email: setup.user.email, password: PASSWORD })
  return result.tokens.refreshToken
}

describe('refresh session rotation', () => {
  it('rotates once and replaying the predecessor revokes the family', async () => {
    const setup = harness()
    const predecessor = await signIn(setup)
    const rotated = await setup.refresh.execute(predecessor)

    await expect(setup.refresh.execute(predecessor)).rejects.toMatchObject({ statusCode: 401 })
    await expect(setup.refresh.execute(rotated.tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('allows only one winner under concurrent refresh and revokes its family on reuse', async () => {
    const setup = harness()
    const predecessor = await signIn(setup)
    const attempts = await Promise.allSettled([
      setup.refresh.execute(predecessor),
      setup.refresh.execute(predecessor),
    ])

    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(winners).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const winner = winners[0]
    if (winner === undefined) throw new Error('expected one rotation winner')
    await expect(setup.refresh.execute(winner.value.tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('isolates session families so replay on one device does not affect another', async () => {
    const setup = harness()
    const computer = await signIn(setup)
    const phone = await signIn(setup)
    const computerRotated = await setup.refresh.execute(computer)

    await expect(setup.refresh.execute(computer)).rejects.toMatchObject({ statusCode: 401 })
    await expect(setup.refresh.execute(computerRotated.tokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(setup.refresh.execute(phone)).resolves.toBeDefined()
  })

  it('revokes valid logout sessions and ignores absent or invalid tokens idempotently', async () => {
    const setup = harness()
    const refreshToken = await signIn(setup)

    await expect(setup.logout.execute(null)).resolves.toBeNull()
    await expect(setup.logout.execute('not-a-token')).resolves.toBeNull()
    await expect(setup.logout.execute(refreshToken)).resolves.toMatchObject({ userId: setup.user.id })
    await expect(setup.logout.execute(refreshToken)).resolves.toBeNull()

    await expect(setup.refresh.execute(refreshToken)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('keeps global active and tokenVersion revocation checks', async () => {
    const setup = harness()
    const refreshToken = await signIn(setup)

    setup.user.active = false
    await expect(setup.refresh.execute(refreshToken)).rejects.toMatchObject({ statusCode: 403 })

    setup.user.active = true
    setup.user.tokenVersion += 1
    await expect(setup.refresh.execute(refreshToken)).rejects.toMatchObject({ statusCode: 401 })
  })
})
