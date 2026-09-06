import type {
  AffiliationModel as AffiliationRow,
  ContractingCompanyModel as ContractingCompanyRow,
  InsuranceProviderModel as InsuranceProviderRow,
} from '../../generated/prisma/models.js'
import type { Affiliation } from '../../domain/entities/affiliationEntity.js'
import type { ContractingCompany } from '../../domain/entities/contractingCompanyEntity.js'
import type { InsuranceProvider } from '../../domain/entities/insuranceProviderEntity.js'
import { normalizePersistedDateOnly } from '../../shared/helpers/dateOnly.js'

export function toAffiliation(row: AffiliationRow): Affiliation {
  return {
    id: row.id,
    patientId: row.patientId,
    insuranceProviderId: row.insuranceProviderId,
    // Ya vino normalizado al guardarse. No se vuelve a normalizar al leer:
    // hacerlo taparia una fila mal guardada en vez de dejarla ver.
    memberNumber: row.memberNumber,
    from: normalizePersistedDateOnly(row.from),
    to: row.to === null ? null : normalizePersistedDateOnly(row.to),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toInsuranceProvider(row: InsuranceProviderRow): InsuranceProvider {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toContractingCompany(row: ContractingCompanyRow): ContractingCompany {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
