import type { IRefreshSessionRepository } from '../../../domain/repositories/IRefreshSessionRepository.js'
import type { ITokenService } from '../../../domain/repositories/ITokenService.js'

/** Revoca una sola familia. Cookies ausentes, vencidas o invalidas son un no-op. */
export interface LoggedOutSession {
  userId: string
  sessionId: string
}

export class LogoutSessionUseCase {
  constructor(
    private readonly tokenService: ITokenService,
    private readonly refreshSessionRepository: IRefreshSessionRepository,
  ) {}

  async execute(refreshToken: string | null): Promise<LoggedOutSession | null> {
    if (refreshToken === null) return null

    const claims = this.tokenService.verifyRefresh(refreshToken)
    if (claims === null) return null

    const revoked = await this.refreshSessionRepository.revoke(claims.sessionId)
    return revoked ? { userId: claims.userId, sessionId: claims.sessionId } : null
  }
}
