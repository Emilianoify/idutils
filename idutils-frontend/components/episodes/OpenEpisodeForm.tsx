'use client'

import { useState } from 'react'
import CareServiceRow, {
  emptyCareService,
  type CareServiceDraft,
} from '@/components/episodes/CareServiceRow'
import { ApiError } from '@/lib/api/client'
import type { ContractingCompany, Specialty } from '@/lib/api/catalogs'
import { openEpisode, type OpenEpisodeCareService } from '@/lib/api/episodes'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { openEpisodeSchema } from '@/lib/schemas/episode'

/**
 * Apertura de episodio con sus prestaciones, en un solo movimiento.
 *
 * Van juntas porque son el mismo hecho del negocio. Si fueran dos pasos, el
 * segundo podría no llegar nunca y quedaría un episodio abierto sin
 * prestaciones: el tablero lo mostraría como trabajo pendiente sin que nadie
 * haya hecho nada mal.
 *
 * Un episodio SIN prestaciones también es válido —se abre y se cargan
 * después—, así que el formulario deja confirmar con la lista vacía.
 */

interface OpenEpisodeFormProps {
  patientId: string
  affiliationId: string
  insuranceProviderName: string
  specialties: readonly Specialty[]
  companies: readonly ContractingCompany[]
  onOpened: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint'

/** Hoy en `YYYY-MM-DD`, en el huso local: es la fecha del reloj del operador. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Del borrador de pantalla al cuerpo que espera la API. */
function toCareService(draft: CareServiceDraft): OpenEpisodeCareService {
  return {
    specialtyId: draft.specialtyId,
    contractingCompanyId: draft.contractingCompanyId,
    professionalId: draft.professionalId.length === 0 ? null : draft.professionalId,
    authorization: draft.withAuthorization
      ? {
          frequencyId: draft.frequencyId,
          validFrom: draft.validFrom,
          validUntil: draft.validUntil,
          notes: draft.notes,
        }
      : null,
  }
}

export default function OpenEpisodeForm({
  patientId,
  affiliationId,
  insuranceProviderName,
  specialties,
  companies,
  onOpened,
}: OpenEpisodeFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [startsOn, setStartsOn] = useState(today())
  const [drafts, setDrafts] = useState<CareServiceDraft[]>([emptyCareService(today())])
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly string[]>([])

  function updateDraft(index: number, patch: Partial<CareServiceDraft>): void {
    setDrafts((current) =>
      current.map((draft, position) =>
        position === index ? { ...draft, ...patch } : draft,
      ),
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFailure(null)
    setIssues([])

    // Una fila intacta no es una prestación a medio cargar: es que el operador
    // no la quiso. Se descarta antes de validar en vez de devolverle errores
    // por algo que nunca completó.
    const filled = drafts.filter((draft) => draft.specialtyId.length > 0)

    const parsed = openEpisodeSchema.safeParse({
      startsOn,
      careServices: filled.map(toCareService),
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setSubmitting(true)

    try {
      await openEpisode({
        patientId,
        affiliationId,
        startsOn: parsed.data.startsOn,
        careServices: parsed.data.careServices,
      })
      onOpened()
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo abrir el episodio. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  return (
    // `method="post"`: antes de hidratar, un envío hace el submit nativo, y un
    // form sin `method` es un GET contra la URL actual.
    <form
      className="flex max-w-[80ch] flex-col gap-8"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex flex-col gap-[7px]">
        <label htmlFor="startsOn" className={LABEL_CLASSES}>
          El episodio arranca el
        </label>
        <input
          id="startsOn"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
          className={`${FIELD_CLASSES} w-fit`}
        />
        <p className="m-0 max-w-[58ch] text-[12.5px] text-light-faint">
          Puede ser una fecha futura. Cuando avisan que el paciente vuelve el jueves,
          el episodio arranca el jueves y el paciente queda como{' '}
          <b className="font-medium text-light-muted">Reingresa</b> hasta ese día.
        </p>
      </div>

      <div className="flex flex-col gap-7">
        {drafts.map((draft, index) => (
          <CareServiceRow
            key={index}
            draft={draft}
            index={index}
            specialties={specialties}
            companies={companies}
            removable={drafts.length > 1}
            onChange={(patch) => updateDraft(index, patch)}
            onRemove={() =>
              setDrafts((current) => current.filter((_, position) => position !== index))
            }
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDrafts((current) => [...current, emptyCareService(startsOn)])}
        className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
      >
        + Agregar otra prestación
      </button>

      {companies.length === 0 && (
        <p className="m-0 max-w-[62ch] border-l-2 border-expiring pl-4 text-[13px] text-light">
          Ninguna empresa tiene convenio con {insuranceProviderName}. La coordinación
          llega a las obras sociales a través de las empresas (D2): sin convenio no hay
          a quién reclamarle, y la prestación no se puede abrir.
        </p>
      )}

      {failure !== null && (
        <p
          role="alert"
          className="m-0 border-l-2 border-expired pl-4 text-[13.5px] text-light"
        >
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

      <button
        type="submit"
        disabled={submitting || !hydrated}
        className="w-fit cursor-pointer border-0 bg-action px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
      >
        {submitting ? 'Abriendo episodio…' : 'Abrir episodio'}
      </button>
    </form>
  )
}
