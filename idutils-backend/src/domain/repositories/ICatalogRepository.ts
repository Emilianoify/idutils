import type { ContractingCompany } from '../entities/contractingCompanyEntity.js'
import type { Frequency } from '../entities/frequencyEntity.js'
import type { InsuranceProvider } from '../entities/insuranceProviderEntity.js'
import type { Locality, Province } from '../entities/localityEntity.js'
import type { Professional } from '../entities/professionalEntity.js'
import type { Specialty } from '../entities/specialtyEntity.js'

/**
 * Los catalogos que alimentan los selectores del alta de una prestacion.
 *
 * Un puerto por catalogo, y no uno solo con todo, porque las implementaciones y
 * los permisos son distintos: `ADMIN` administra especialidades y frecuencias,
 * `OPERADOR` solo las lee (D14).
 *
 * Nota sobre baja logica: ninguno tiene `delete`. Puede haber autorizaciones
 * apuntando a una frecuencia y prestaciones apuntando a una especialidad; se
 * desactiva, no se borra (D11).
 */

export interface ISpecialtyRepository {
  findById(id: string): Promise<Specialty | null>
  listActive(): Promise<Specialty[]>
  create(specialty: Pick<Specialty, 'name' | 'serviceUnit'>): Promise<Specialty>
  update(id: string, changes: Partial<Pick<Specialty, 'name' | 'serviceUnit'>>): Promise<Specialty>
  deactivate(id: string): Promise<void>
}

export interface IFrequencyRepository {
  findById(id: string): Promise<Frequency | null>
  listActive(): Promise<Frequency[]>

  /**
   * Las elegibles para una especialidad. ES el filtro del selector (D11).
   *
   * Asignar Medico Clinico no ofrece 100 frecuencias: ofrece las relacionadas
   * con clinico. No es una feature de UI que haya que acordarse de programar,
   * es el join, y por eso el puerto no expone "todas" para este caso de uso.
   */
  listEligibleForSpecialty(specialtyId: string): Promise<Frequency[]>

  create(frequency: Pick<Frequency, 'amount' | 'unit'>): Promise<Frequency>
  /** Editar es crear nueva y desactivar la vieja: en el lugar es peor que borrar (D11). */
  deactivate(id: string): Promise<void>
  linkToSpecialty(specialtyId: string, frequencyId: string): Promise<void>
  unlinkFromSpecialty(specialtyId: string, frequencyId: string): Promise<void>
}

export interface IProfessionalRepository {
  findById(id: string): Promise<Professional | null>
  listActive(): Promise<Professional[]>
  /** Para el selector de una prestacion: solo los habilitados en esa especialidad (D13). */
  listActiveBySpecialty(specialtyId: string): Promise<Professional[]>
  /** Alimenta `validateCareServiceDraft`. */
  listSpecialtyIds(professionalId: string): Promise<string[]>
  create(
    professional: Omit<Professional, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<Professional>
  update(
    id: string,
    changes: Partial<Omit<Professional, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
  ): Promise<Professional>
  setSpecialties(professionalId: string, specialtyIds: readonly string[]): Promise<void>
}

export interface IContractingCompanyRepository {
  findById(id: string): Promise<ContractingCompany | null>
  listActive(): Promise<ContractingCompany[]>
  /** Las empresas que llegan a esa obra social. Es el selector correcto por D2. */
  listActiveByInsuranceProvider(insuranceProviderId: string): Promise<ContractingCompany[]>
  create(
    company: Omit<ContractingCompany, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<ContractingCompany>
  setInsuranceProviders(
    contractingCompanyId: string,
    insuranceProviderIds: readonly string[],
  ): Promise<void>
}

export interface IInsuranceProviderRepository {
  findById(id: string): Promise<InsuranceProvider | null>
  listActive(): Promise<InsuranceProvider[]>
  /**
   * Solo las alcanzadas por alguna empresa que contrata a la coordinacion.
   *
   * Es la cobertura DERIVADA de D2: la coordinacion no tiene contrato con
   * ninguna obra social. Un selector con el catalogo entero deja cargar un
   * paciente que despues no se le puede facturar a nadie.
   */
  listReachable(): Promise<InsuranceProvider[]>
  create(provider: Pick<InsuranceProvider, 'name'>): Promise<InsuranceProvider>
}

export interface ILocalityRepository {
  findById(id: string): Promise<Locality | null>
  listProvinces(): Promise<Province[]>
  listByProvince(provinceId: string): Promise<Locality[]>
  /** Busqueda por nombre para el autocompletado del domicilio. */
  search(text: string, limit: number): Promise<Locality[]>
}
