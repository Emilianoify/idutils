import type {
  AuthorizationModel as AuthorizationRow,
  CareServiceModel as CareServiceRow,
  HomeCareEpisodeModel as HomeCareEpisodeRow,
} from '../../generated/prisma/models.js'
import type { Authorization } from '../../domain/entities/authorizationEntity.js'
import type {
  CareService,
  CareServiceWithAuthorizations,
} from '../../domain/entities/careServiceEntity.js'
import type { HomeCareEpisode } from '../../domain/entities/homeCareEpisodeEntity.js'
import { normalizePersistedDateOnly } from '../../shared/helpers/dateOnly.js'

export function toHomeCareEpisode(row: HomeCareEpisodeRow): HomeCareEpisode {
  return {
    id: row.id,
    patientId: row.patientId,
    affiliationId: row.affiliationId,
    startsOn: normalizePersistedDateOnly(row.startsOn),
    endsOn: row.endsOn === null ? null : normalizePersistedDateOnly(row.endsOn),
    closeReason: row.closeReason,
    closeNote: row.closeNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toCareService(row: CareServiceRow): CareService {
  return {
    id: row.id,
    episodeId: row.episodeId,
    specialtyId: row.specialtyId,
    contractingCompanyId: row.contractingCompanyId,
    professionalId: row.professionalId,
    endedOn: row.endedOn === null ? null : normalizePersistedDateOnly(row.endedOn),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toAuthorization(row: AuthorizationRow): Authorization {
  return {
    id: row.id,
    careServiceId: row.careServiceId,
    frequencyId: row.frequencyId,
    // Congelados al autorizar: se leen de la autorizacion, nunca del catalogo.
    frequencyAmount: row.frequencyAmount,
    frequencyUnit: row.frequencyUnit,
    validFrom: normalizePersistedDateOnly(row.validFrom),
    validUntil: normalizePersistedDateOnly(row.validUntil),
    claimedAt: row.claimedAt === null ? null : normalizePersistedDateOnly(row.claimedAt),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toCareServiceWithAuthorizations(
  row: CareServiceRow & { authorizations: AuthorizationRow[] },
): CareServiceWithAuthorizations {
  return {
    ...toCareService(row),
    authorizations: row.authorizations.map(toAuthorization),
  }
}
