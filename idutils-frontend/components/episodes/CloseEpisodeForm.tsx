'use client'

import { useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { closeEpisode } from '@/lib/api/episodes'
import { CloseReason, CLOSE_REASON_LABELS, QUEUE_LABELS } from '@/lib/domain/patient'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { closeEpisodeSchema } from '@/lib/schemas/episode'

/**
 * Cerrar el episodio. El motivo es obligatorio y no es burocracia.
 *
 * El motivo es lo que decide EN QUÉ BANDEJA queda el paciente: internación lo
 * manda a "esperando alta", fin de cobertura a "reautorizar", alta médica a
 * ningún lado. Sin motivo, un hueco en la historia podría ser cualquiera de
 * las tres, y las tres se trabajan distinto.
 *
 * Por eso, además, la pantalla muestra la bandeja resultante apenas cierra: el
 * backend la devuelve justamente para que el operador no la descubra tres días
 * después mirando una lista.
 */

interface CloseEpisodeFormProps {
  episodeId: string
  onClosed: () => void
  onCancel: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint'

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** `FormData.get` devuelve `File | string | null`; el schema espera texto. */
function textField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export default function CloseEpisodeForm({
  episodeId,
  onClosed,
  onCancel,
}: CloseEpisodeFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly string[]>([])
  const [landedIn, setLandedIn] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFailure(null)
    setIssues([])

    const formData = new FormData(event.currentTarget)
    const parsed = closeEpisodeSchema.safeParse({
      endsOn: textField(formData, 'endsOn'),
      closeReason: textField(formData, 'closeReason'),
      closeNote: textField(formData, 'closeNote'),
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setSubmitting(true)

    try {
      const result = await closeEpisode(episodeId, parsed.data)
      // Se muestra la bandeja antes de irse: es la información por la que el
      // backend se toma el trabajo de devolverla.
      setLandedIn(QUEUE_LABELS[result.queue])
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo cerrar el episodio. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  if (landedIn !== null) {
    return (
      <div className="border-l-2 border-covered bg-field-raised p-4">
        <p className="m-0 text-[13.5px] text-light">
          Episodio cerrado. El paciente queda en{' '}
          <b className="font-medium text-covered">{landedIn}</b>.
        </p>
        <button
          type="button"
          onClick={onClosed}
          className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Volver a la ficha
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex max-w-[62ch] flex-col gap-[19px] border-l-2 border-expiring bg-field-raised p-4"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex flex-col gap-[7px]">
        <label htmlFor="endsOn" className={LABEL_CLASSES}>
          Cierra el
        </label>
        <input
          id="endsOn"
          name="endsOn"
          type="date"
          defaultValue={today()}
          className={`${FIELD_CLASSES} w-fit`}
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="closeReason" className={LABEL_CLASSES}>
          Motivo
        </label>
        <select id="closeReason" name="closeReason" defaultValue="" className={FIELD_CLASSES}>
          <option value="" disabled>
            Elegí un motivo
          </option>
          {Object.values(CloseReason).map((reason) => (
            <option key={reason} value={reason} className="bg-field-raised">
              {CLOSE_REASON_LABELS[reason]}
            </option>
          ))}
        </select>
        <p className="m-0 text-[12.5px] text-light-faint">
          El motivo decide en qué bandeja queda el paciente. No es un dato de archivo.
        </p>
      </div>

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="closeNote" className={LABEL_CLASSES}>
          Nota
        </label>
        <input
          id="closeNote"
          name="closeNote"
          type="text"
          defaultValue=""
          placeholder="Ej.: en qué sanatorio quedó internado"
          className={FIELD_CLASSES}
        />
      </div>

      {failure !== null && (
        <p role="alert" className="m-0 border-l-2 border-expired pl-4 text-[13px] text-light">
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-1 border-l-2 border-expired pl-4 text-[13px] text-light"
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
          className="cursor-pointer border-0 bg-action px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {submitting ? 'Cerrando…' : 'Cerrar episodio'}
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
