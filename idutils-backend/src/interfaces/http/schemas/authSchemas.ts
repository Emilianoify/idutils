import { z } from 'zod'
import { normalizeEmail } from '../../../shared/normalization/email.js'

/**
 * El login.
 *
 * La contrasena se valida con `min(1)` y no con las reglas de complejidad: acá
 * se está VERIFICANDO una contrasena que ya existe, no creando una. Exigir
 * ocho caracteres para iniciar sesion solo le cuenta al que prueba de a una que
 * ese intento ni siquiera llego a compararse.
 */
export const loginSchema = z.object({
  /**
   * Se normaliza ANTES de validar, no despues.
   *
   * Un correo copiado y pegado viene con un espacio al final mas seguido de
   * lo que parece. Si se valida primero, ese espacio lo convierte en
   * "correo invalido" y el operador se queda afuera mirando un mensaje que
   * no lo ayuda. Es la misma `normalizeEmail` que usa el caso de uso: una
   * sola implementacion, aplicada en el borde.
   */
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email({ error: 'El correo no es válido' })),
  password: z.string().min(1, { error: 'Escribí tu contraseña' }),
})

export type LoginBody = z.infer<typeof loginSchema>
