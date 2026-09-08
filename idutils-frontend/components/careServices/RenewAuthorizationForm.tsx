'use client'

import { useEffect, useState } from 'react'
import { getFrequencies, type Frequency } from '@/lib/api/catalogs'
import { createAuthorization } from '@/lib/api/careServices'
import { ApiError } from '@/lib/api/client'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { authorizationDraftSchema } from '@/lib/schemas/episode'

/**
 * Renovar es AGREGAR una autorización, nunca editar la anterior.
 *
 * Por eso este formulario crea una fila nueva y no toca la vigente. No existe
 * ningún `PUT` de autorización en la API, y la interfaz no puede ofrecer uno:
 * pisar un `validUntil` borraría la línea de tiempo con la que se defiende una
 * auditoría.
 */

interface RenewAuthorizationFormProps {
  careServiceId: string
  specialtyId: string
  onRenewed: () => void
  onCancel: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[7px] text-[14px] text-light transition-colors focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint'

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export default function RenewAuthorizationForm({
  careServiceId,
  specialtyId,
  onRenewed,
  onCancel,
}: RenewAuthorizationFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [frequencies, setFrequencies] = useState<readonly Frequency[]>([])
  const [frequencyId, setFrequencyId] = useState('')
  const [validFrom, setValidFrom] = useState(today())
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [issues, setIssues] = useState<readonly string[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const eligible = await getFrequencies(specialtyId)
        if (active) setFrequencies(eligible)
      } catch {
        if (active) setFrequencies([])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [specialtyId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIssues([])
    setFailure(null)

    const parsed = authorizationDraftSchema.safeParse({
      frequencyId,
      validFrom,
      validUntil,
      notes,
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setSubmitting(true)

    try {
      await createAuthorization(careServiceId, parsed.data)
      onRenewed()
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo registrar la autorización. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3 border-l-2 border-covered bg-field pl-4 pr-3 py-3"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <p className="m-0 text-[12px] uppercase tracking-[0.13em] text-light-faint">
        Nueva autorización
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`renew-frequency-${careServiceId}`} className={LABEL_CLASSES}>
            Frecuencia
          </label>
          <select
            id={`renew-frequency-${careServiceId}`}
            value={frequencyId}
            onChange={(event) => setFrequencyId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí una
            </option>
            {frequencies.map((frequency) => (
              <option key={frequency.id} value={frequency.id} className="bg-field-raised">
                {frequency.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`renew-from-${careServiceId}`} className={LABEL_CLASSES}>
            Desde
          </label>
          <input
            id={`renew-from-${careServiceId}`}
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`renew-until-${careServiceId}`} className={LABEL_CLASSES}>
            Vence el
          </label>
          <input
            id={`renew-until-${careServiceId}`}
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`renew-notes-${careServiceId}`} className={LABEL_CLASSES}>
            N.º de autorización
          </label>
          <input
            id={`renew-notes-${careServiceId}`}
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      {failure !== null && (
        <p role="alert" className="m-0 text-[12.5px] text-expired">
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul role="alert" className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-expired">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting || !hydrated}
          className="cursor-pointer border-0 bg-action px-4 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {submitting ? 'Guardando…' : 'Agregar autorización'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
