/**
 * El profesional de la coordinacion (D13).
 *
 * `taxId`, `bankAccount` y `bankAlias` son DATOS DE CONTACTO DE PAGO, no un
 * modulo de liquidacion: IDUtils no calcula honorarios, no emite ordenes de
 * pago y no lleva cuenta corriente. Estan porque la coordinacion le paga a su
 * propio profesional y hoy eso vive en un Excel aparte.
 *
 * Son datos financieros de terceros: nunca en logs, nunca en exports que no los
 * pidan explicitamente. Misma disciplina que las credenciales de Amanda.
 */
export interface Professional {
  id: string
  lastName: string
  firstName: string
  documentNumber: string | null
  /** Matricula. */
  licenseNumber: string | null
  phone: string | null
  email: string | null
  taxId: string | null
  bankAccount: string | null
  bankAlias: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Relacion, no un campo: Yolanda hace kinesiologia motora y respiratoria.
 * Sirve para validar la asignacion a una prestacion (D13).
 */
export interface ProfessionalSpecialty {
  id: string
  professionalId: string
  specialtyId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
