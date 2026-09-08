import { z } from 'zod'
import { FrequencyUnit, ServiceUnit } from '@/lib/domain/careService'
import { apiFetch } from './client'

/**
 * Los selectores del alta.
 *
 * Cada endpoint devuelve LO QUE SE PUEDE ELEGIR, no el catálogo entero. Las
 * obras sociales son las ALCANZABLES (D2): la coordinación no tiene contrato
 * con ninguna, llega a ellas a través de las empresas, y un selector con el
 * catálogo completo deja cargar un paciente que después no se le puede
 * facturar a nadie.
 *
 * Ninguno pagina: son listas de selector, acotadas por definición.
 */

const insuranceProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const provinceSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const localitySchema = z.object({
  id: z.string(),
  provinceId: z.string(),
  name: z.string(),
  postalCode: z.string().nullable(),
})

export type InsuranceProvider = z.infer<typeof insuranceProviderSchema>
export type Province = z.infer<typeof provinceSchema>
export type Locality = z.infer<typeof localitySchema>

function listEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(item),
  })
}

const insuranceProvidersEnvelope = listEnvelope(insuranceProviderSchema)
const provincesEnvelope = listEnvelope(provinceSchema)
const localitiesEnvelope = listEnvelope(localitySchema)

export async function getInsuranceProviders(): Promise<InsuranceProvider[]> {
  const response = await apiFetch(
    '/api/catalogs/insurance-providers',
    {},
    insuranceProvidersEnvelope.parse,
  )
  return response.data
}

export async function getProvinces(): Promise<Province[]> {
  const response = await apiFetch('/api/catalogs/provinces', {}, provincesEnvelope.parse)
  return response.data
}

/**
 * Localidades por provincia.
 *
 * El backend devuelve una lista VACÍA si no se le pasa ni provincia ni texto:
 * son 24 provincias con miles de localidades y no existe "traelas todas". Por
 * eso el alta pide la provincia primero, y recién ahí se puebla la localidad.
 */
export async function getLocalitiesByProvince(provinceId: string): Promise<Locality[]> {
  const query = new URLSearchParams({ provinceId })
  const response = await apiFetch(
    `/api/catalogs/localities?${query.toString()}`,
    {},
    localitiesEnvelope.parse,
  )
  return response.data
}

// --- Los selectores de una prestación ---------------------------------------

const specialtySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** El sustantivo con el que se cuenta: visitas, sesiones, horas (D11). */
  serviceUnit: z.enum(ServiceUnit),
})

const frequencySchema = z.object({
  id: z.string(),
  amount: z.number(),
  unit: z.enum(FrequencyUnit),
  /**
   * "2 visitas semanales", ya con el sustantivo de la especialidad (D11).
   *
   * Lo arma el backend, no esta pantalla: la regla vive en `formatFrequency` y
   * una segunda implementación acá quedaría diciendo otra cosa el día que se
   * agregue una unidad nueva.
   */
  label: z.string(),
})

const contractingCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
})

const professionalSchema = z.object({
  id: z.string(),
  lastName: z.string(),
  firstName: z.string().nullable(),
  licenseNumber: z.string().nullable(),
})

export type Specialty = z.infer<typeof specialtySchema>
export type Frequency = z.infer<typeof frequencySchema>
export type ContractingCompany = z.infer<typeof contractingCompanySchema>
export type Professional = z.infer<typeof professionalSchema>

const specialtiesEnvelope = listEnvelope(specialtySchema)
const frequenciesEnvelope = listEnvelope(frequencySchema)
const contractingCompaniesEnvelope = listEnvelope(contractingCompanySchema)
const professionalsEnvelope = listEnvelope(professionalSchema)

export async function getSpecialties(): Promise<Specialty[]> {
  const response = await apiFetch('/api/catalogs/specialties', {}, specialtiesEnvelope.parse)
  return response.data
}

/**
 * Las empresas que llegan a esa obra social, no todas.
 *
 * Es D2 hecho selector: la coordinación no tiene contrato con ninguna obra
 * social, llega a ellas a través de las empresas. Ofrecer una empresa sin
 * convenio deja cargar una prestación que después no se le puede reclamar a
 * nadie — y reclamar es para lo que existe este sistema.
 */
export async function getContractingCompanies(
  insuranceProviderId: string,
): Promise<ContractingCompany[]> {
  const query = new URLSearchParams({ insuranceProviderId })
  const response = await apiFetch(
    `/api/catalogs/contracting-companies?${query.toString()}`,
    {},
    contractingCompaniesEnvelope.parse,
  )
  return response.data
}

/**
 * `specialtyId` es OBLIGATORIO y el backend lo exige.
 *
 * Asignar Médico Clínico no ofrece las 11 frecuencias del catálogo: ofrece las
 * que esa especialidad habilita (D11). Si el endpoint las devolviera todas
 * cuando falta el parámetro, el filtro pasaría a ser responsabilidad del
 * frontend, o sea de nadie.
 */
export async function getFrequencies(specialtyId: string): Promise<Frequency[]> {
  const query = new URLSearchParams({ specialtyId })
  const response = await apiFetch(
    `/api/catalogs/frequencies?${query.toString()}`,
    {},
    frequenciesEnvelope.parse,
  )
  return response.data
}

export async function getProfessionals(specialtyId?: string): Promise<Professional[]> {
  const query = new URLSearchParams()
  if (specialtyId !== undefined) query.set('specialtyId', specialtyId)

  const suffix = query.size === 0 ? '' : `?${query.toString()}`
  const response = await apiFetch(
    `/api/catalogs/professionals${suffix}`,
    {},
    professionalsEnvelope.parse,
  )
  return response.data
}
