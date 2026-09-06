/**
 * Normalizacion del correo. UN SOLO LUGAR, por la misma razon que
 * `normalizeMemberNumber`.
 *
 * `Ana@Clinica.com` y `ana@clinica.com` son la misma persona para cualquiera
 * menos para un indice unico. Si el alta guarda una forma y el login busca la
 * otra, el usuario existe y no puede entrar, y el sintoma —"a veces no me deja"—
 * no apunta a ningun lado.
 *
 * Solo minusculas y trim. Nada de sacar puntos ni sufijos `+algo`: eso es una
 * regla de Gmail, no del correo, y aplicarla a todos rompe direcciones validas
 * de otros proveedores.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
