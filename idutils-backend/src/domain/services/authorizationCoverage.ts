import type { Authorization } from '../entities/authorizationEntity.js'
import {
  AuthorizationStatus,
  DEFAULT_EXPIRY_WARNING_DAYS,
} from '../enums/authorizationStatus.js'
import { daysBetweenDateOnly } from '../../shared/helpers/dateOnly.js'

/**
 * El motor de vencimientos. Es el nucleo del producto: IDUtils no es un sistema
 * de registro, es un sistema de vencimientos y reclamos.
 *
 * Todo se deriva de la lista de autorizaciones y una fecha. No hay columna
 * "vencida" ni cron que la actualice, y por eso no existe la noche en que el
 * cron no corre y el dashboard miente sin avisar.
 */

/** La cobertura de una prestacion a una fecha, con lo necesario para no reclamar de mas. */
export interface Coverage {
  status: AuthorizationStatus
  /** La autorizacion que cubre la fecha. null si no hay ninguna. */
  current: Authorization | null
  /**
   * Dias hasta el vencimiento de `current`. 0 = vence hoy. null si no hay
   * cobertura: ahi la pregunta no es "cuanto falta" sino "desde cuando esta
   * descubierta", y eso se lee en `previous`.
   */
  daysUntilExpiry: number | null
  /** La ultima que vencio, cuando no hay cobertura. Contesta desde cuando. */
  previous: Authorization | null
  /**
   * La proxima que empieza despues de la fecha, si ya esta cargada.
   *
   * Existe para no hacer reclamar dos veces: una prestacion VENCIDA hoy pero
   * con la renovacion ya cargada para el jueves es un dato distinto de una
   * vencida sin nada atras, aunque las dos esten descubiertas hoy.
   */
  next: Authorization | null
}

function live(authorizations: readonly Authorization[]): Authorization[] {
  return authorizations.filter((authorization) => authorization.deletedAt === null)
}

function latestBy(
  authorizations: readonly Authorization[],
  pick: (authorization: Authorization) => number,
): Authorization | null {
  if (authorizations.length === 0) return null
  return authorizations.reduce((latest, current) =>
    pick(current) > pick(latest) ? current : latest,
  )
}

/**
 * Estado de cobertura de una prestacion a una fecha.
 *
 * `validUntil` es INCLUSIVE: una autorizacion "hasta el 30/9" cubre el 30/9.
 * No es un detalle: correrlo un dia es reclamar algo que todavia estaba
 * vigente, o no reclamar el dia que hacia falta.
 *
 * @param warningDays umbral de aviso. Lo administra la coordinacion; el default
 *                    del dominio es lo que tarda una empresa en renovar.
 */
export function coverageAt(
  authorizations: readonly Authorization[],
  date: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
): Coverage {
  const all = live(authorizations)

  if (all.length === 0) {
    return {
      status: AuthorizationStatus.SIN_AUTORIZACION,
      current: null,
      daysUntilExpiry: null,
      previous: null,
      next: null,
    }
  }

  const at = date.getTime()

  // Si hay solapadas, gana la que llega mas lejos: es la que manda hasta cuando
  // la prestacion esta cubierta.
  const covering = all.filter(
    (authorization) =>
      authorization.validFrom.getTime() <= at && at <= authorization.validUntil.getTime(),
  )
  const current = latestBy(covering, (authorization) => authorization.validUntil.getTime())

  const upcoming = all.filter((authorization) => authorization.validFrom.getTime() > at)
  const next =
    upcoming.length === 0
      ? null
      : upcoming.reduce((earliest, authorization) =>
          authorization.validFrom.getTime() < earliest.validFrom.getTime()
            ? authorization
            : earliest,
        )

  if (current !== null) {
    const daysUntilExpiry = daysBetweenDateOnly(date, current.validUntil)

    return {
      status:
        daysUntilExpiry <= warningDays
          ? AuthorizationStatus.POR_VENCER
          : AuthorizationStatus.VIGENTE,
      current,
      daysUntilExpiry,
      previous: null,
      next,
    }
  }

  const expired = all.filter((authorization) => authorization.validUntil.getTime() < at)
  const previous = latestBy(expired, (authorization) => authorization.validUntil.getTime())

  return {
    status:
      previous === null
        ? AuthorizationStatus.SIN_AUTORIZACION
        : AuthorizationStatus.VENCIDA,
    current: null,
    daysUntilExpiry: null,
    previous,
    next,
  }
}

/**
 * Si el operador tiene que hacer algo con esta prestacion hoy.
 *
 * Una POR_VENCER ya reclamada sigue siendo POR_VENCER (el papel todavia no
 * llego), pero ya no es trabajo pendiente: reclamarla de nuevo es ruido, y el
 * ruido es lo que hace que la gente deje de mirar la lista.
 */
export function needsClaim(coverage: Coverage): boolean {
  if (coverage.status === AuthorizationStatus.VIGENTE) return false

  // Ya hay renovacion cargada: no hay nada que reclamar, hay que esperar.
  if (coverage.next !== null) return false

  if (coverage.status === AuthorizationStatus.POR_VENCER) {
    return coverage.current?.claimedAt == null
  }

  return true
}
