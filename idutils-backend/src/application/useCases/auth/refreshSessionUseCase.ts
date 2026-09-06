import type { ITokenService } from '../../../domain/repositories/ITokenService.js'
import type { IRefreshSessionRepository } from '../../../domain/repositories/IRefreshSessionRepository.js'
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { RefreshSessionResult } from '../../dto/authDto.js'

/**
 * Renueva el par de tokens a partir del refresh.
 *
 * Cada login tiene una familia independiente en la base. El refresh vigente se
 * consume con una escritura condicional y se reemplaza; presentar un predecesor
 * revoca solo esa familia. `tokenVersion` conserva su unica responsabilidad:
 * invalidar todas las sesiones por cambio de contrasena o baja.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly refreshSessionRepository: IRefreshSessionRepository,
  ) {}

  async execute(refreshToken: string): Promise<RefreshSessionResult> {
    const claims = this.tokenService.verifyRefresh(refreshToken)
    if (claims === null) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
    }

    const user = await this.userRepository.findById(claims.userId)
    if (user === null) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
    }

    if (!user.active) {
      throw new AppError(403, ERROR_MESSAGES.AUTH.INACTIVE_USER)
    }

    // El corte de verdad: si el numero del token no es el del usuario, ese
    // token nacio antes de un cambio de contrasena o de una baja.
    if (claims.tokenVersion !== user.tokenVersion) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
    }

    const tokens = this.tokenService.issue(
      {
        userId: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      claims.sessionId,
    )

    const rotation = await this.refreshSessionRepository.rotate({
      sessionId: claims.sessionId,
      userId: user.id,
      currentTokenId: claims.tokenId,
      nextTokenId: tokens.refreshSession.tokenId,
      tokenVersion: claims.tokenVersion,
      expiresAt: tokens.refreshSession.expiresAt,
      now: new Date(),
    })

    if (rotation !== 'rotated') {
      throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
    }

    return {
      sessionId: claims.sessionId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        // El rol se relee de la base y no se copia del token: si un ADMIN paso
        // a LECTOR hace dos minutos, la sesion tiene que reflejarlo sin
        // esperar a que venza el refresh.
        role: user.role,
      },
      tokens,
    }
  }
}
