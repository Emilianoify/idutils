import type { IPasswordHasher } from '../../../domain/repositories/IPasswordHasher.js'
import type { IRefreshSessionRepository } from '../../../domain/repositories/IRefreshSessionRepository.js'
import type { ITokenService } from '../../../domain/repositories/ITokenService.js'
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { normalizeEmail } from '../../../shared/normalization/email.js'
import type { LoginCommand, LoginResult } from '../../dto/authDto.js'

/**
 * Inicio de sesion.
 *
 * El orden de los chequeos importa y no es casual:
 *
 *  1. usuario inexistente  -> "usuario o contrasena incorrectos"
 *  2. contrasena incorrecta -> "usuario o contrasena incorrectos"
 *  3. usuario dado de baja  -> "el usuario esta dado de baja"
 *
 * Los dos primeros dan EL MISMO mensaje a proposito: si dijeran cosas
 * distintas, cualquiera podria averiguar que correos existen en el sistema
 * probando de a uno, sin saber ninguna contrasena.
 *
 * Y la baja se chequea DESPUES de verificar la contrasena, no antes. Si fuera
 * al reves, ese mensaje distinto delataria que la cuenta existe.
 */
export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService,
    private readonly refreshSessionRepository: IRefreshSessionRepository,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const email = normalizeEmail(command.email)
    const user = await this.userRepository.findByEmailForAuthentication(email)

    if (user === null) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
    }

    const matches = await this.passwordHasher.verify(user.passwordHash, command.password)
    if (!matches) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
    }

    if (!user.active) {
      throw new AppError(403, ERROR_MESSAGES.AUTH.INACTIVE_USER)
    }

    const tokens = this.tokenService.issue({
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    })

    await this.refreshSessionRepository.create({
      id: tokens.refreshSession.id,
      userId: user.id,
      currentTokenId: tokens.refreshSession.tokenId,
      expiresAt: tokens.refreshSession.expiresAt,
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    }
  }
}
