/**
 * Razon social literal, 1:1 con la fuente. Nada de siglas inventadas: un
 * catalogo "prolijo" sin tabla de alias pierde matcheos en silencio.
 *
 * No lleva `isSwissAudited`: eso es del modulo Amanda (D4).
 */
export interface InsuranceProvider {
  id: string
  name: string
  active: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
