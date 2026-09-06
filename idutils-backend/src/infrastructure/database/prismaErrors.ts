import { ERROR_MESSAGES } from '../../shared/constants/messages.js'
import { AppError } from '../../shared/errors/AppError.js'

/**
 * Traduce lo que rechaza la BASE a un error que el operador pueda leer.
 *
 * Las reglas del core viven en `prisma/sql/core_invariants.sql` y no en la
 * aplicacion a proposito: una validacion de aplicacion se saltea desde un
 * script, desde el seed o desde una consola de soporte; una constraint no. La
 * contra de esa decision es que el error llega escrito por Postgres, y
 * "violates exclusion constraint no_overlapping_episodes" no le dice nada a
 * quien esta cargando un reingreso.
 *
 * Esto es el otro extremo de esa decision: el unico lugar donde el nombre de
 * una constraint se convierte en una instruccion. Si un dia se agrega una
 * constraint a ese .sql y no se agrega aca, el operador va a ver el texto crudo
 * de Postgres: por eso las dos listas se leen juntas.
 */

interface ConstraintTranslation {
  statusCode: number
  message: string
}

/**
 * Nombre de constraint -> que hacer. Las claves son literalmente las de
 * `core_invariants.sql` y las `@@unique` del schema.
 */
const CONSTRAINT_TRANSLATIONS: Readonly<Record<string, ConstraintTranslation>> = {
  // --- D9: episodios ---
  no_overlapping_episodes: {
    statusCode: 409,
    message: ERROR_MESSAGES.EPISODE.OVERLAPS,
  },
  episode_ends_after_start: {
    statusCode: 400,
    message: ERROR_MESSAGES.EPISODE.CLOSES_BEFORE_START,
  },
  close_reason_matches_end_date: {
    statusCode: 400,
    // Un episodio cerrado sin motivo no cae en ninguna bandeja: el paciente
    // desaparece de la pantalla, que es justo lo que el sistema vino a evitar.
    message: 'Un episodio cerrado necesita un motivo de cierre',
  },

  // --- D8: afiliaciones ---
  affiliations_current_member_number_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.AFFILIATION.ALREADY_TAKEN,
  },
  affiliation_ends_after_start: {
    statusCode: 400,
    message: ERROR_MESSAGES.AFFILIATION.CLOSES_BEFORE_START,
  },

  // --- D7: prestaciones ---
  care_services_active_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.CARE_SERVICE.DUPLICATED,
  },

  // --- D10: autorizaciones ---
  authorization_valid_period: {
    statusCode: 400,
    message: ERROR_MESSAGES.AUTHORIZATION.PERIODO_INVALIDO,
  },
  authorization_frequency_amount_positive: {
    statusCode: 400,
    message: 'La cantidad de la frecuencia tiene que ser mayor que cero',
  },
  frequency_amount_positive: {
    statusCode: 400,
    message: 'La cantidad de la frecuencia tiene que ser mayor que cero',
  },

  // --- D15: contactos ---
  patient_contacts_single_primary_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.PATIENT.PRIMARY_CONTACT_TAKEN,
  },

  // --- Unicidades de catalogo declaradas en el schema ---
  insurance_providers_name_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.NAME_TAKEN },
  contracting_companies_name_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.NAME_TAKEN },
  specialties_name_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.NAME_TAKEN },
  provinces_name_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.NAME_TAKEN },
  localities_provinceId_name_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.NAME_TAKEN },
  users_email_key: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.EMAIL_TAKEN },
  frequencies_amount_unit_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.DATABASE.FREQUENCY_TAKEN,
  },
  company_insurance_providers_contractingCompanyId_insuranceProviderId_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.DATABASE.LINK_ALREADY_EXISTS,
  },
  specialty_frequencies_specialtyId_frequencyId_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.DATABASE.LINK_ALREADY_EXISTS,
  },
  professional_specialties_professionalId_specialtyId_key: {
    statusCode: 409,
    message: ERROR_MESSAGES.DATABASE.LINK_ALREADY_EXISTS,
  },
}

/** Codigos de Prisma que tienen una lectura de negocio, sin importar la tabla. */
const CODE_TRANSLATIONS: Readonly<Record<string, ConstraintTranslation>> = {
  P2002: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.UNIQUE_VIOLATION },
  P2003: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.REFERENCE_NOT_FOUND },
  P2014: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.STILL_REFERENCED },
  P2025: { statusCode: 404, message: ERROR_MESSAGES.DATABASE.RECORD_NOT_FOUND },
  // CHECK y EXCLUDE no tienen codigo propio: Prisma los devuelve como error de
  // base sin interpretar. El nombre de la constraint viaja en el mensaje, y por
  // eso la busqueda por texto de arriba corre ANTES que este mapa.
  P2010: { statusCode: 409, message: ERROR_MESSAGES.DATABASE.CONSTRAINT_VIOLATION },
}

/** Hasta donde se sigue la cadena de `cause`. Tres niveles cubren pg -> adapter -> Prisma. */
const MAX_CAUSE_DEPTH = 3

/**
 * Junta todo el texto donde puede venir el nombre de la constraint.
 *
 * Se mira en varios lados porque el lugar cambia segun quien rechace: Prisma
 * pone el indice en `meta.target` cuando lo conoce, el driver lo deja en
 * `meta.constraint`, y una EXCLUDE que Prisma no modela llega solo dentro del
 * mensaje. Buscar en uno solo funciona hasta el dia que no.
 */
function collectHints(error: unknown, depth = 0): string[] {
  if (depth > MAX_CAUSE_DEPTH || error === null || typeof error !== 'object') return []

  const record = error as Record<string, unknown>
  const hints: string[] = []

  if (typeof record.message === 'string') hints.push(record.message)

  const meta = record.meta
  if (meta !== null && typeof meta === 'object') {
    for (const value of Object.values(meta as Record<string, unknown>)) {
      if (typeof value === 'string') hints.push(value)
      else if (Array.isArray(value)) {
        hints.push(...value.filter((item): item is string => typeof item === 'string'))
      }
    }
  }

  hints.push(...collectHints(record.cause, depth + 1))

  return hints
}

function readCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null

  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' ? code : null
}

/**
 * El `AppError` equivalente, o `null` si el error no viene de la base.
 *
 * Devuelve `null` en vez de envolver cualquier cosa a proposito: un
 * `TypeError` de la aplicacion disfrazado de 409 es un bug que nadie encuentra
 * porque la pantalla muestra un mensaje razonable.
 */
export function translatePrismaError(error: unknown): AppError | null {
  const hints = collectHints(error)

  for (const [constraint, translation] of Object.entries(CONSTRAINT_TRANSLATIONS)) {
    if (hints.some((hint) => hint.includes(constraint))) {
      return new AppError(translation.statusCode, translation.message)
    }
  }

  const code = readCode(error)
  const byCode = code === null ? undefined : CODE_TRANSLATIONS[code]
  if (byCode !== undefined) {
    return new AppError(byCode.statusCode, byCode.message)
  }

  return null
}

/**
 * Corre la escritura y traduce lo que rechace la base.
 *
 * Se aplica en cada metodo que escribe, no en un proxy generico: un envoltorio
 * automatico traduce tambien lo que no tiene que traducir, y ahi es donde un
 * bug de la aplicacion sale por pantalla como si fuera un dato mal cargado.
 */
export async function withDomainErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const translated = translatePrismaError(error)
    if (translated === null) throw error
    throw translated
  }
}
