'use client'

import Link from 'next/link'
import type { CareServiceStatusRow } from '@/lib/api/dashboard'
import { STATUS_STYLES } from '@/lib/domain/authorizationStatus'
import { formatDateOnly } from '@/lib/format/dateOnly'

/**
 * La pantalla por la que existe IDUtils.
 *
 * No es un listado de prestaciones: es la lista de lo que hay que reclamar,
 * ordenada por urgencia, con el nombre de la empresa a la que se le reclama al
 * lado. Es la respuesta a "¿a quién llamo hoy?".
 *
 * Cada fila lleva al paciente porque el reclamo se registra sobre la
 * autorización, y la autorización se ve en la ficha: desde acá se decide a quién
 * llamar, no se registra el hecho.
 */

const STATUS_LABELS = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
  SIN_AUTORIZACION: 'Sin autorización',
} as const

interface ClaimsListProps {
  claims: readonly CareServiceStatusRow[]
}

/** Qué dice cada fila sin obligar a leer tres columnas. */
function urgency(row: CareServiceStatusRow): string {
  if (row.status === 'SIN_AUTORIZACION') return 'nunca se autorizó'
  if (row.status === 'VENCIDA') {
    return `sin cobertura desde el ${formatDateOnly(row.uncoveredSince)}`
  }
  if (row.daysUntilExpiry === null) return ''
  if (row.daysUntilExpiry === 0) return 'vence hoy'
  return `vence en ${row.daysUntilExpiry} días`
}

export default function ClaimsList({ claims }: ClaimsListProps): React.ReactElement {
  if (claims.length === 0) {
    return (
      <p className="m-0 max-w-[62ch] text-[13.5px] text-covered">
        No hay nada que reclamar hoy. Todas las prestaciones activas tienen cobertura
        con margen.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-px bg-field-line">
      {claims.map((row) => {
        const style = STATUS_STYLES[row.status]

        return (
          <article
            key={row.careServiceId}
            className={`flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-l-2 bg-field-raised px-4 py-3 ${style.border}`}
          >
            <div className="min-w-0">
              <Link
                href={`/patients/${row.patientId}`}
                className="text-[14.5px] font-medium text-light underline-offset-4 hover:underline"
              >
                {row.patientName}
              </Link>
              <span className="text-[13px] text-light-muted">
                {' · '}
                {row.specialtyName}
              </span>
              {row.frequencyLabel !== null && (
                <span className="text-[13px] text-light-faint">
                  {' · '}
                  {row.frequencyLabel}
                </span>
              )}
              <p className="m-0 mt-0.5 text-[12.5px] text-light-faint">
                Se le reclama a{' '}
                <b className="font-medium text-light-muted">
                  {row.contractingCompanyName}
                </b>
                {row.professionalName !== null && ` · la hace ${row.professionalName}`}
              </p>
            </div>

            <div className="text-right">
              <div className={`text-[12.5px] font-medium ${style.text}`}>
                {STATUS_LABELS[row.status]}
              </div>
              <div className="text-[12.5px] text-light-faint">{urgency(row)}</div>
              {/* Reclamada no es autorizada: sigue venciendo, pero ya se pidió. */}
              {row.claimed && (
                <div className="text-[11px] uppercase tracking-[0.13em] text-expiring">
                  ya reclamada
                </div>
              )}
              {row.hasUpcomingAuthorization && (
                <div className="text-[11px] uppercase tracking-[0.13em] text-covered">
                  renovación cargada
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
