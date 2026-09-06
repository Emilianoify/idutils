import { redirect } from 'next/navigation'

/**
 * La raíz no tiene contenido propio: manda al ingreso.
 *
 * Cuando exista el tablero de verdad, esta decisión se mueve a un lugar que
 * sepa si hay sesión. Hoy no hay a dónde más ir.
 */
export default function HomePage(): never {
  redirect('/login')
}
