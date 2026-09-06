/**
 * La empresa de ID que subcontrata a la coordinacion.
 *
 * La cadena real del negocio es obra social -> empresa -> coordinacion (D1).
 * Esta entidad es el eslabon del medio, y es A QUIEN SE LE RECLAMA (D10).
 */
export interface ContractingCompany {
  id: string
  name: string
  active: boolean
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * El convenio empresa-obra social. Es la cobertura DERIVADA de D2.
 *
 * Una coordinacion no tiene contrato con OSDE: tiene contrato con una empresa
 * que si lo tiene. Los sitios comerciales dicen "trabajamos con OSDE"; en el
 * modelo de datos eso es falso, y esta tabla es la que lo mantiene honesto.
 */
export interface CompanyInsuranceProvider {
  id: string
  contractingCompanyId: string
  insuranceProviderId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
