import type {
  FrequencyModel as FrequencyRow,
  LocalityModel as LocalityRow,
  ProfessionalModel as ProfessionalRow,
  ProvinceModel as ProvinceRow,
  SpecialtyModel as SpecialtyRow,
} from '../../generated/prisma/models.js'
import type { Frequency } from '../../domain/entities/frequencyEntity.js'
import type { Locality, Province } from '../../domain/entities/localityEntity.js'
import type { Professional } from '../../domain/entities/professionalEntity.js'
import type { Specialty } from '../../domain/entities/specialtyEntity.js'

/** Los catalogos no tienen fechas civiles: aca no hay nada que normalizar. */

export function toSpecialty(row: SpecialtyRow): Specialty {
  return {
    id: row.id,
    name: row.name,
    serviceUnit: row.serviceUnit,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toFrequency(row: FrequencyRow): Frequency {
  return {
    id: row.id,
    amount: row.amount,
    unit: row.unit,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    documentNumber: row.documentNumber,
    licenseNumber: row.licenseNumber,
    phone: row.phone,
    email: row.email,
    taxId: row.taxId,
    bankAccount: row.bankAccount,
    bankAlias: row.bankAlias,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toProvince(row: ProvinceRow): Province {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toLocality(row: LocalityRow): Locality {
  return {
    id: row.id,
    provinceId: row.provinceId,
    name: row.name,
    postalCode: row.postalCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
