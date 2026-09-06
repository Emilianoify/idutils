import {
  type IUserRepository,
  UserDeactivationResult,
} from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Baja de usuario, con las dos unicas reglas que importan.
 *
 * 1. NADIE SE DA DE BAJA A SI MISMO. No es paternalismo: el que aprieta el
 *    boton queda afuera en el acto, y si ademas era el unico ADMIN, el sistema
 *    se queda sin quien lo arregle.
 *
 * 2. NO SE PUEDE DEJAR EL SISTEMA SIN NINGUN ADMIN ACTIVO. Sin administrador
 *    no hay quien de de alta usuarios ni administre catalogos, y la unica
 *    salida es entrar a la base a mano. Esa es la clase de estado que un
 *    sistema no tiene que permitir alcanzar, ni siquiera a propósito.
 *
 * Las dos se chequean ACA y no en el controller porque no son reglas de HTTP:
 * valen igual si un dia esto lo llama un comando de consola.
 */
export class DeactivateUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string, requestedBy: string): Promise<void> {
    if (userId === requestedBy) {
      throw new AppError(409, ERROR_MESSAGES.USER.CANNOT_DEACTIVATE_SELF)
    }

    const result = await this.userRepository.deactivateSafely(userId)
    if (result === UserDeactivationResult.NOT_FOUND) {
      throw new AppError(404, ERROR_MESSAGES.USER.NOT_FOUND)
    }
    if (result === UserDeactivationResult.ALREADY_INACTIVE) {
      throw new AppError(409, ERROR_MESSAGES.USER.ALREADY_INACTIVE)
    }
    if (result === UserDeactivationResult.LAST_ADMIN) {
      throw new AppError(409, ERROR_MESSAGES.USER.LAST_ADMIN)
    }
  }
}
