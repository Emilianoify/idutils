'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ApiError } from '@/lib/api/client'
import type { InsuranceProvider } from '@/lib/api/catalogs'
import { lookupAffiliation, type PatientSummary } from '@/lib/api/patients'
import { fullName } from '@/lib/domain/patient'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { affiliationLookupSchema } from '@/lib/schemas/patient'

/**
 * El paso OBLIGATORIO de D8: preguntar antes de crear.
 *
 * No es una comodidad de la interfaz, es la regla que evita el paciente
 * duplicado. Y `found: true` NO vincula nada: muestra a quién pertenece esa
 * afiliación para que el operador decida a mano si es la misma persona o si se
 * equivocó de número. El sistema no adivina por nombre — así es como el Excel
 * termina con tres Juan Pérez.
 *
 * Por eso el resto del formulario no existe todavía: no está escondido detrás
 * de un `disabled` que alguien pueda saltear, directamente no está montado.
 */

interface AffiliationLookupStepProps {
  insuranceProviders: readonly InsuranceProvider[]
  /** Se llama solo cuando la afiliación está libre. */
  onAvailable: (affiliation: { insuranceProviderId: string; memberNumber: string }) => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors placeholder:text-light-faint focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint'

export default function AffiliationLookupStep({
  insuranceProviders,
  onAvailable,
}: AffiliationLookupStepProps): React.ReactElement {
  const hydrated = useHydrated()
  const [checking, setChecking] = useState(false)
  const [taken, setTaken] = useState<PatientSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly string[]>([])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFailure(null)
    setIssues([])
    setTaken(null)

    const formData = new FormData(event.currentTarget)
    const parsed = affiliationLookupSchema.safeParse({
      insuranceProviderId: formData.get('insuranceProviderId'),
      memberNumber: formData.get('memberNumber'),
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setChecking(true)

    try {
      const result = await lookupAffiliation(
        parsed.data.insuranceProviderId,
        parsed.data.memberNumber,
      )

      if (result.found && result.patient !== null) {
        setTaken(result.patient)
        return
      }

      onAvailable(parsed.data)
    } catch (error) {
      // Los mensajes del backend ya están escritos para el operador y dicen qué
      // hacer. Se muestran tal cual.
      setFailure(
        error instanceof ApiError
          ? error.message
          : 'No se pudo verificar la afiliación. Volvé a intentar',
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    // `method="post"`: antes de que React hidrate, un envío hace el submit
    // NATIVO, y un form sin `method` es un GET contra la URL actual. Acá no hay
    // contraseña, pero el número de afiliado es dato del paciente y no tiene
    // por qué quedar en el historial ni en el log de un proxy.
    <form
      className="flex max-w-[52ch] flex-col gap-[19px]"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <div className="flex flex-col gap-[7px]">
        <label htmlFor="insuranceProviderId" className={LABEL_CLASSES}>
          Obra social
        </label>
        <select
          id="insuranceProviderId"
          name="insuranceProviderId"
          defaultValue=""
          className={FIELD_CLASSES}
        >
          <option value="" disabled>
            Elegí una obra social
          </option>
          {insuranceProviders.map((provider) => (
            <option key={provider.id} value={provider.id} className="bg-field-raised">
              {provider.name}
            </option>
          ))}
        </select>
        {insuranceProviders.length === 0 && (
          <p className="m-0 text-[12.5px] text-unauthorized">
            No hay obras sociales alcanzables. Una coordinación llega a ellas a través
            de las empresas: hasta que no haya un convenio cargado, no se puede dar de
            alta a nadie.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="memberNumber" className={LABEL_CLASSES}>
          N.º de afiliado
        </label>
        <input
          id="memberNumber"
          name="memberNumber"
          type="text"
          autoComplete="off"
          placeholder="Como figura en la credencial"
          className={FIELD_CLASSES}
        />
      </div>

      {issues.length > 0 && (
        <ul role="alert" className="m-0 list-none border-l-2 border-expired pl-4 text-[13px] text-light">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {failure !== null && (
        <p role="alert" className="m-0 border-l-2 border-expired pl-4 text-[13px] text-light">
          {failure}
        </p>
      )}

      {taken !== null && (
        <div role="alert" className="border-l-2 border-expiring bg-field-raised p-4">
          <p className="m-0 text-[13.5px] text-light">
            Esa afiliación ya es de{' '}
            <Link
              href={`/patients/${taken.id}`}
              className="font-medium text-expiring underline underline-offset-4"
            >
              {fullName(taken)}
            </Link>
            .
          </p>
          <p className="m-0 mt-2 text-[12.5px] text-light-faint">
            Si es la misma persona, trabajá sobre su ficha. Si no lo es, revisá el
            número: dos pacientes no pueden compartir una afiliación vigente.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={checking || !hydrated || insuranceProviders.length === 0}
        className="mt-1 w-fit cursor-pointer border-0 bg-action px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
      >
        {checking ? 'Verificando…' : 'Verificar afiliación'}
      </button>
    </form>
  )
}
