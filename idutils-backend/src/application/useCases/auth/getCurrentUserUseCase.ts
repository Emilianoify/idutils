import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import type { AuthenticatedUserView } from '../../dto/authDto.js'

/**
 * Quien soy, segun la base y no segun el token.
 *
 * Existe justamente para eso: el token lleva `userId` y `role` congelados en el
 * momento del login, y esta consulta dice lo de AHORA. Es lo que permite que el
 * token no cargue el nombre ni el correo, que serian dos datos mas cacheados en
 * el navegador hasta que expire.
 */
export class GetCurrentUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<AuthenticatedUserView> {
    const user = await this.userRepository.findById(userId)

    if (user === null || !user.active) {
      throw new AppError(401, ERROR_MESSAGES.AUTH.SESSION_EXPIRED)
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }
  }
}
