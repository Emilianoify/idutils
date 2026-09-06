import { z } from 'zod'

/**
 * Validación del formulario de ingreso.
 *
 * Es la MISMA regla que el backend, escrita del lado del navegador para no
 * hacer un viaje al servidor por un correo mal escrito. No la reemplaza: la
 * validación que manda es la de la API, porque un cliente se puede saltear.
 *
 * La contraseña pide `min(1)` y no largo mínimo, igual que en el backend: acá
 * se está VERIFICANDO una credencial que ya existe, no creando una. Exigir doce
 * caracteres para entrar solo le contaría a quien prueba de a una que ese
 * intento ni llegó a compararse.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email({ error: 'Escribí un correo válido' })),
  password: z.string().min(1, { error: 'Escribí tu contraseña' }),
})

export type LoginInput = z.infer<typeof loginSchema>
