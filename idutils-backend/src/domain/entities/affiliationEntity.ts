/**
 * La identidad (obra social, N de afiliado) identifica a la AFILIACION, no a
 * la persona (D8).
 *
 * Si el paciente cambia de obra social sigue siendo el mismo paciente: se
 * cierra esta afiliacion con `to` y se abre otra. Hoy la coordinacion resuelve
 * esto duplicando el paciente en el Excel, y ahi es exactamente donde se pierde
 * el historial que despues pide una auditoria.
 */
export interface Affiliation {
  id: string
  patientId: string
  insuranceProviderId: string
  /** Ya normalizado. Se guarda pasado por `normalizeMemberNumber`, nunca crudo. */
  memberNumber: string
  from: Date
  /** null = vigente. */
  to: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
