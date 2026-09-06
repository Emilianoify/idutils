/**
 * El paciente pertenece a la coordinacion, no a una empresa (D7).
 *
 * Fijate lo que NO esta: obra social, numero de afiliado, empresa y estado.
 * Los cuatro son la aplanadura del Excel. Aca la cobertura vive en
 * `Affiliation`, la empresa en `CareService`, y el estado se deriva de los
 * episodios con `statusAt`.
 */
export interface Patient {
  id: string
  lastName: string
  firstName: string
  /** DNI. Opcional: no siempre viene, y la unicidad practica la da la afiliacion. */
  documentNumber: string | null
  birthDate: Date | null
  addressStreet: string
  addressDetail: string | null
  /** Siempre FK al catalogo. Nunca texto libre (D12). */
  localityId: string
  notes: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Lista, no un campo `phone` en Patient (D15). El que atiende el timbre, el
 * hijo que autoriza y el de la urgencia suelen ser tres personas distintas;
 * aplanarlos a un telefono es lo que obliga a abrir el WhatsApp para el resto.
 */
export interface PatientContact {
  id: string
  patientId: string
  name: string
  /** Vinculo: hijo, esposa, cuidadora, encargado. */
  relationship: string
  phone: string
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
