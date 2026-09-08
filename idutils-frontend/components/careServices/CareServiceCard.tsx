'use client'

import { useState } from 'react'
import CareServiceActions from '@/components/careServices/CareServiceActions'
import RenewAuthorizationForm from '@/components/careServices/RenewAuthorizationForm'
import {
  claimAuthorization,
  type CareServiceTimeline,
} from '@/lib/api/careServices'
import { ApiError } from '@/lib/api/client'
import { STATUS_STYLES } from '@/lib/domain/authorizationStatus'
import { ABSENT, formatDateOnly } from '@/lib/format/dateOnly'

/**
 * Una prestación con su línea de tiempo.
 *
 * El estado de cobertura llega derivado del backend y acá solo se pinta. Lo que
 * sí decide esta pantalla es qué ofrecerle al operador, y son dos cosas
 * distintas que no hay que confundir:
 *
 *   RECLAMAR  deja constancia de que se pidió la renovación. No autoriza nada.
 *             La prestación sale de la lista de pendientes pero SIGUE VENCIENDO.
 *   RENOVAR   agrega la autorización que la empresa efectivamente otorgó.
 *
 * Confundirlas es como el sistema termina diciendo que algo está autorizado
 * porque alguien mandó un WhatsApp.
 */

const STATUS_LABELS = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
  SIN_AUTORIZACION: 'Sin autorización',
} as const

interface CareServiceCardProps {
  careService: CareServiceTimeline
  /** Solo un episodio abierto admite reclamos y renovaciones. */
  mutable: boolean
  onChanged: () => void
}

export default function CareServiceCard({
  careService,
  mutable,
  onChanged,
}: CareServiceCardProps): React.ReactElement {
  const [renewing, setRenewing] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const style = STATUS_STYLES[careService.status]
  const ended = careService.endedOn !== null
  /**
   * Con el episodio TERMINADO, todo lo de abajo es historia.
   *
   * Lo decide el backend, no un `endsOn !== null` de acá: un cierre con fecha
   * futura deja el episodio corriendo, y ahí la cobertura sí es la de hoy y sí
   * hay que reclamar lo que vence antes de esa fecha.
   */
  const historical = careService.episodeFinished

  async function claim(): Promise<void> {
    if (careService.claimableAuthorizationId === null) return

    setFailure(null)
    setClaiming(true)

    try {
      await claimAuthorization(careService.claimableAuthorizationId)
      onChanged()
    } catch (error) {
      setFailure(
        error instanceof ApiError ? error.message : 'No se pudo registrar el reclamo',
      )
      setClaiming(false)
    }
  }

  return (
    <article
      className={`border-l-2 bg-field-raised px-4 py-3.5 ${ended || historical ? 'border-field-line opacity-70' : style.border}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="text-[14.5px] font-medium text-light">
            {careService.specialtyName}
          </span>
          <span className="text-[13px] text-light-faint">
            {' · '}
            {careService.contractingCompanyName}
          </span>
          <span className="text-[13px] text-light-muted">
            {' · '}
            {careService.professionalName ?? 'sin profesional'}
          </span>
        </div>

        <span
          className={`text-[12.5px] font-medium ${ended || historical ? 'text-light-faint' : style.text}`}
        >
          {ended
            ? `Terminó el ${formatDateOnly(careService.endedOn)}`
            : historical
              ? `Al cierre: ${STATUS_LABELS[careService.status].toLowerCase()}`
              : STATUS_LABELS[careService.status]}
        </span>
      </header>

      {historical && !ended && (
        <p className="m-0 mt-1 text-[12.5px] text-light-faint">
          El episodio cerró el {formatDateOnly(careService.episodeEndsOn)}. Esto es cómo
          quedó la cobertura ese día.
        </p>
      )}

      {!ended && !historical && (
        <p className="m-0 mt-1 text-[12.5px] text-light-faint">
          {careService.status === 'VIGENTE' && careService.daysUntilExpiry !== null
            ? `Vence en ${careService.daysUntilExpiry} días`
            : careService.status === 'POR_VENCER' && careService.daysUntilExpiry !== null
              ? `Vence en ${careService.daysUntilExpiry} días · hay que reclamar`
              : careService.status === 'VENCIDA'
                ? `Sin cobertura desde el ${formatDateOnly(careService.uncoveredSince)}`
                : 'La prestación existe y nunca se autorizó'}
        </p>
      )}

      {careService.authorizations.length > 0 && (
        <ol className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
          {careService.authorizations.map((authorization) => (
            <li
              key={authorization.id}
              className="flex flex-wrap items-baseline gap-x-3 text-[12.5px]"
            >
              <span className="tabular text-light-muted">
                {formatDateOnly(authorization.validFrom)} →{' '}
                {formatDateOnly(authorization.validUntil)}
              </span>
              <span className="text-light">{authorization.frequencyLabel}</span>
              {authorization.notes.length > 0 && (
                <span className="text-light-faint">N.º {authorization.notes}</span>
              )}
              {authorization.claimedAt !== null && (
                <span className="text-expiring">
                  reclamada el {formatDateOnly(authorization.claimedAt)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {careService.authorizations.length === 0 && (
        <p className="m-0 mt-2 text-[12.5px] text-unauthorized">
          Todavía no hay ninguna autorización cargada. {ABSENT}
        </p>
      )}

      {failure !== null && (
        <p role="alert" className="m-0 mt-2 text-[12.5px] text-expired">
          {failure}
        </p>
      )}

      {mutable && !ended && !renewing && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {careService.needsClaim && careService.claimableAuthorizationId !== null && (
            <button
              type="button"
              onClick={() => void claim()}
              disabled={claiming}
              className="cursor-pointer border border-expiring bg-transparent px-3.5 py-1.5 text-[12.5px] font-medium text-expiring transition-colors hover:bg-field disabled:cursor-progress disabled:opacity-60"
            >
              {claiming ? 'Registrando…' : 'Dejar constancia del reclamo'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setRenewing(true)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-light-faint underline-offset-4 hover:text-light hover:underline"
          >
            Cargar autorización
          </button>

          <CareServiceActions
            careServiceId={careService.careServiceId}
            specialtyId={careService.specialtyId}
            currentProfessionalName={careService.professionalName}
            onChanged={onChanged}
          />
        </div>
      )}

      {renewing && (
        <RenewAuthorizationForm
          careServiceId={careService.careServiceId}
          specialtyId={careService.specialtyId}
          onRenewed={() => {
            setRenewing(false)
            onChanged()
          }}
          onCancel={() => setRenewing(false)}
        />
      )}
    </article>
  )
}
