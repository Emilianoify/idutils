import type { Role } from '../../../generated/prisma/enums.js'
import type { IPasswordHasher } from '../../../domain/repositories/IPasswordHasher.js'
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { normalizeEmail } from '../../../shared/normalization/email.js'
import type { AuthenticatedUserView } from '../../dto/authDto.js'

export interface CreateUserCommand {
  email: string
  password: string
  name: string
  role: Role
}

/**
 * Alta de usuario. Solo la hace un ADMIN.
 *
 * La contrasena entra en texto plano, se hashea aca y NO SALE: lo que se
 * devuelve es `AuthenticatedUserView`, un tipo donde el hash directamente no
 * existe como campo. El tipo lo impide; no la disciplina de acordarse de
 * sacarlo en cada serializador.
 *
 * El correo se normaliza con la misma funcion que usa el login. Si el alta
 * guardara `Ana@Clinica.com` y el login buscara `ana@clinica.com`, el usuario
 * existiria y no podria entrar, y el sintoma —"a veces no me deja"— no apunta a
 * ningun lado.
 */
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(command: CreateUserCommand): Promise<AuthenticatedUserView> {
    const email = normalizeEmail(command.email)

    // La garantia real es el unique de la base, que ademas cubre la carrera
    // entre dos altas simultaneas. Esto esta para dar el mensaje correcto en
    // vez de una violacion de indice traducida.
    const existing = await this.userRepository.findByEmailForAuthentication(email)
    if (existing !== null) {
      throw new AppError(409, ERROR_MESSAGES.DATABASE.EMAIL_TAKEN)
    }

    const user = await this.userRepository.create({
      email,
      passwordHash: await this.passwordHasher.hash(command.password),
      name: command.name,
      role: command.role,
      active: true,
    })

    return { id: user.id, email: user.email, name: user.name, role: user.role }
  }
}
