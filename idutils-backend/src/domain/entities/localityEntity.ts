/**
 * Provincia y localidad son CORE: donde vive el paciente (D12). La coordinacion
 * atiende tambien el interior, y el domicilio tiene que ser un dato, no una
 * cadena de texto.
 *
 * Zona NO esta aca: es del modulo de recorridos, y es otra cosa: como se
 * agrupan los pacientes para armar un movil.
 */
export interface Province {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface Locality {
  id: string
  provinceId: string
  name: string
  postalCode: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
