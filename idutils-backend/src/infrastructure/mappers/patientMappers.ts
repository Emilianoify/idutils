import type {
  PatientModel as PatientRow,
  PatientContactModel as PatientContactRow,
} from '../../generated/prisma/models.js'
import type { Patient, PatientContact } from '../../domain/entities/patientEntity.js'
import { normalizePersistedDateOnly } from '../../shared/helpers/dateOnly.js'

/**
 * Fila de Prisma -> entidad del dominio.
 *
 * No es ceremonia: las columnas `@db.Date` vuelven como `Date` y el driver
 * puede traerlas con hora. El dominio compara POR DIA, y una fecha con hora
 * hace que "vence el 30/9" sea verdadero a las 00:00 y falso a las 10:00. Por
 * eso toda fecha civil pasa por `normalizePersistedDateOnly` al entrar.
 *
 * Los timestamps de auditoria (`createdAt`, `updatedAt`, `deletedAt`) NO se
 * normalizan: ahi la hora es el dato.
 */

export function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    documentNumber: row.documentNumber,
    birthDate: row.birthDate === null ? null : normalizePersistedDateOnly(row.birthDate),
    addressStreet: row.addressStreet,
    addressDetail: row.addressDetail,
    localityId: row.localityId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

export function toPatientContact(row: PatientContactRow): PatientContact {
  return {
    id: row.id,
    patientId: row.patientId,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
