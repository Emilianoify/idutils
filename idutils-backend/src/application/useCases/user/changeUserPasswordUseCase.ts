import type { IPasswordHasher } from '../../../domain/repositories/IPasswordHasher.js'
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Cambio de contrasena.
 *
 * El repositorio sube `tokenVersion` en la MISMA operacion, y eso es lo que
 * cierra todas las sesiones abiertas de ese usuario. Van juntos a proposito:
 * cambiar la contrasena sin invalidar los tokens emitidos deja adentro al que
 * se los robo, que es exactamente el escenario por el que alguien la cambia.
 *
 * Efecto practico y deseado: si un ADMIN le cambia la contrasena a un operador,
 * ese operador queda afuera en todos sus dispositivos. Es la unica forma de
 * "cerrar sesion en todas partes" que tiene el sistema, y esta bien que sea
 * asi: el dia que haga falta una operacion aparte para eso, se agrega.
 */
export class ChangeUserPasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(userId: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (user === null) throw new AppError(404, ERROR_MESSAGES.USER.NOT_FOUND)

    await this.userRepository.changePassword(
      user.id,
      await this.passwordHasher.hash(newPassword),
    )
  }
}
