import type { Patient, PatientContact } from '../entities/patientEntity.js'

export interface PatientSearchCriteria {
  /** Busca por apellido, nombre o documento. */
  text?: string
  localityId?: string
  limit: number
  offset: number
}

export interface PatientSearchResult {
  items: Patient[]
  total: number
}

export type NewPatient = Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
export type PatientChanges = Partial<NewPatient>

export interface IPatientRepository {
  findById(id: string): Promise<Patient | null>

  /**
   * El listado con el que el operador decide si vincular o crear (D8).
   *
   * Existe porque el DNI no siempre viene: cuando entra una afiliacion cuyo
   * (obra social, N de afiliado) no existe, el sistema OBLIGA a buscar aca y
   * decidir a mano. La vinculacion es manual y explicita a proposito; adivinar
   * por nombre es como el Excel termina con tres Juan Perez.
   */
  search(criteria: PatientSearchCriteria): Promise<PatientSearchResult>

  create(patient: NewPatient): Promise<Patient>
  update(id: string, changes: PatientChanges): Promise<Patient>
  /** Baja logica. Nunca DELETE: hay episodios y autorizaciones colgando. */
  softDelete(id: string): Promise<void>

  listContacts(patientId: string): Promise<PatientContact[]>
  addContact(
    contact: Omit<PatientContact, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<PatientContact>
  /**
   * Marca uno como principal y baja al anterior en la misma transaccion.
   * La base tiene un unique parcial: hacerlo en dos pasos falla a mitad.
   */
  setPrimaryContact(patientId: string, contactId: string): Promise<void>
}
