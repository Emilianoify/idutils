import type { CloseReason, FrequencyUnit } from '../../src/generated/prisma/enums.js'
import type { Authorization } from '../../src/domain/entities/authorizationEntity.js'
import type { Frequency } from '../../src/domain/entities/frequencyEntity.js'
import type { HomeCareEpisode } from '../../src/domain/entities/homeCareEpisodeEntity.js'
import { parseDateOnly } from '../../src/shared/helpers/dateOnly.js'

/** Atajo para no escribir `parseDateOnly` treinta veces en cada test. */
export const d = parseDateOnly

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${sequence}`
}

const EPOCH = parseDateOnly('2026-01-01')

export interface EpisodeOptions {
  startsOn: string
  endsOn?: string
  closeReason?: CloseReason
  closeNote?: string
  patientId?: string
  deletedAt?: Date | null
}

export function episode(options: EpisodeOptions): HomeCareEpisode {
  return {
    id: nextId('episode'),
    patientId: options.patientId ?? 'patient-1',
    affiliationId: 'affiliation-1',
    startsOn: d(options.startsOn),
    endsOn: options.endsOn === undefined ? null : d(options.endsOn),
    closeReason: options.closeReason ?? null,
    closeNote: options.closeNote ?? null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: options.deletedAt ?? null,
  }
}

export interface AuthorizationOptions {
  validFrom: string
  validUntil: string
  claimedAt?: string
  careServiceId?: string
  amount?: number
  unit?: FrequencyUnit
  deletedAt?: Date | null
}

export function authorization(options: AuthorizationOptions): Authorization {
  return {
    id: nextId('authorization'),
    careServiceId: options.careServiceId ?? 'care-service-1',
    frequencyId: 'frequency-1',
    frequencyAmount: options.amount ?? 2,
    frequencyUnit: options.unit ?? 'SEMANAL',
    validFrom: d(options.validFrom),
    validUntil: d(options.validUntil),
    claimedAt: options.claimedAt === undefined ? null : d(options.claimedAt),
    notes: '',
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: options.deletedAt ?? null,
  }
}

export function frequency(overrides: Partial<Frequency> = {}): Frequency {
  return {
    id: 'frequency-1',
    amount: 2,
    unit: 'SEMANAL',
    active: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
    ...overrides,
  }
}
