'use client'

import { useEffect, useState } from 'react'
import { getInsuranceProviders, type InsuranceProvider } from '@/lib/api/catalogs'
import { ApiError } from '@/lib/api/client'
import { changeInsuranceProvider } from '@/lib/api/patients'
import { QUEUE_LABELS, STATUS_PRESENTATION, WorkQueue } from '@/lib/domain/patient'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { changeInsuranceProviderSchema } from '@/lib/schemas/patient'

/**
 * Cambio de obra social. Tres escrituras y un solo hecho.
 *
 * Ese día cierra la afiliación anterior, cierra el episodio abierto con motivo
 * CAMBIO_OBRA_SOCIAL y arranca la nueva — todo en una transacción. Por eso hay
 * UNA sola fecha: pedir tres invitaría a que no coincidan, y un episodio que
 * cierra un día distinto del que empieza la cobertura nueva es un agujero en la
 * historia del paciente.
 *
 * Y no es una corrección: es un HECHO del negocio. Corregir una obra social mal
 * cargada sería otra cosa, y borraría el historial que acá se conserva.
 */

interface ChangeInsuranceProviderFormProps {
  patientId: string
  currentProviderName: string
  /** Se avisa antes de confirmar: cerrar el episodio es consecuencia, no accidente. */
  hasOpenEpisode: boolean
  onChanged: () => void
  onCancel: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[8px] text-[14px] text-light transition-colors focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint'

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export default function ChangeInsuranceProviderForm({
  patientId,
  currentProviderName,
  hasOpenEpisode,
  onChanged,
  onCancel,
}: ChangeInsuranceProviderFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [providers, setProviders] = useState<readonly InsuranceProvider[]>([])
  const [insuranceProviderId, setInsuranceProviderId] = useState('')
  const [memberNumber, setMemberNumber] = useState('')
  const [changedOn, setChangedOn] = useState(today())
  const [submitting, setSubmitting] = useState(false)
  const [issues, setIssues] = useState<readonly string[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const reachable = await getInsuranceProviders()
        if (active) setProviders(reachable)
      } catch {
        if (active) setProviders([])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIssues([])
    setFailure(null)

    const parsed = changeInsuranceProviderSchema.safeParse({
      insuranceProviderId,
      memberNumber,
      changedOn,
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setSubmitting(true)

    try {
      const result = await changeInsuranceProvider(patientId, parsed.data)
      // El estado nuevo lo deriva el backend. Se muestra antes de volver, para
      // que quede claro que el paciente cayó en una bandeja de trabajo.
      setDone(STATUS_PRESENTATION[result.status].label)
    } catch (error) {
      if (error instanceof ApiError) {
        // El backend dice qué hacer cuando el número ya es de otro paciente.
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo registrar el cambio de obra social. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  if (done !== null) {
    return (
      <div className="border-l-2 border-covered bg-field-raised p-4">
        <p className="m-0 text-[13.5px] text-light">
          Cobertura cambiada. El paciente queda{' '}
          <b className="font-medium text-covered">{done}</b>, en la bandeja{' '}
          <b className="font-medium text-covered">
            {QUEUE_LABELS[WorkQueue.REAUTORIZAR]}
          </b>
          .
        </p>
        <p className="m-0 mt-2 max-w-[58ch] text-[12.5px] text-light-faint">
          No se abrió un episodio nuevo a propósito: la obra social nueva puede
          autorizar otras especialidades y otras frecuencias. Abrilo cuando tengas los
          papeles.
        </p>
        <button
          type="button"
          onClick={onChanged}
          className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Ver la ficha actualizada
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4 border-l-2 border-expiring bg-field-raised p-4"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <p className="m-0 text-[12px] uppercase tracking-[0.13em] text-light-faint">
        Cambio de obra social
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-provider" className={LABEL_CLASSES}>
            Obra social nueva
          </label>
          <select
            id="new-provider"
            value={insuranceProviderId}
            onChange={(event) => setInsuranceProviderId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí una
            </option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id} className="bg-field-raised">
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-member-number" className={LABEL_CLASSES}>
            N.º de afiliado
          </label>
          <input
            id="new-member-number"
            type="text"
            autoComplete="off"
            value={memberNumber}
            onChange={(event) => setMemberNumber(event.target.value)}
            placeholder="Como figura en la credencial"
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="changed-on" className={LABEL_CLASSES}>
            Rige desde
          </label>
          <input
            id="changed-on"
            type="date"
            value={changedOn}
            onChange={(event) => setChangedOn(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      {/* Las consecuencias se dicen ANTES, no se descubren después. */}
      <div className="max-w-[62ch] text-[12.5px] text-light-faint">
        Ese día se cierra la cobertura de{' '}
        <b className="font-medium text-light-muted">{currentProviderName}</b>
        {hasOpenEpisode && (
          <>
            {' '}
            y se <b className="font-medium text-expiring">cierra el episodio abierto</b>,
            con motivo &ldquo;cambio de obra social&rdquo;
          </>
        )}
        . El paciente queda para reautorizar: no se abre un episodio nuevo, porque la
        obra social nueva puede autorizar otras prestaciones.
      </div>

      {failure !== null && (
        <p role="alert" className="m-0 border-l-2 border-expired pl-3 text-[12.5px] text-light">
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-0.5 border-l-2 border-expired pl-3 p-0 text-[12.5px] text-light"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting || !hydrated}
          className="cursor-pointer border-0 bg-action px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {submitting ? 'Registrando…' : 'Registrar el cambio'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
