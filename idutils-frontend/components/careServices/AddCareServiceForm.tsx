'use client'

import { useEffect, useState } from 'react'
import {
  getContractingCompanies,
  getProfessionals,
  getSpecialties,
  type ContractingCompany,
  type Professional,
  type Specialty,
} from '@/lib/api/catalogs'
import { createCareService } from '@/lib/api/careServices'
import { ApiError } from '@/lib/api/client'
import { professionalName } from '@/lib/domain/careService'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { createCareServiceSchema } from '@/lib/schemas/careService'

/**
 * Agrega una prestación a un episodio que ya está abierto.
 *
 * Nace SIN autorización, y está bien: la prestación existe mientras se espera
 * el papel, y el tablero la va a mostrar como "sin autorización" — que no es lo
 * mismo que vencida. La autorización se carga después, desde la tarjeta.
 *
 * Las empresas se piden filtradas por la obra social del episodio (D2): la
 * coordinación no llega a las obras sociales directamente, llega a través de
 * las empresas, y ofrecer una sin convenio deja cargar algo que después no se
 * le puede reclamar a nadie.
 */

interface AddCareServiceFormProps {
  episodeId: string
  insuranceProviderId: string
  onCreated: () => void
  onCancel: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[7px] text-[14px] text-light transition-colors focus:border-action focus:outline-none disabled:opacity-45'

const LABEL_CLASSES =
  'text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint'

export default function AddCareServiceForm({
  episodeId,
  insuranceProviderId,
  onCreated,
  onCancel,
}: AddCareServiceFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [specialties, setSpecialties] = useState<readonly Specialty[]>([])
  const [companies, setCompanies] = useState<readonly ContractingCompany[]>([])
  const [professionals, setProfessionals] = useState<readonly Professional[]>([])

  const [specialtyId, setSpecialtyId] = useState('')
  const [contractingCompanyId, setContractingCompanyId] = useState('')
  const [professionalId, setProfessionalId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [issues, setIssues] = useState<readonly string[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const [available, reachable] = await Promise.all([
          getSpecialties(),
          getContractingCompanies(insuranceProviderId),
        ])

        if (!active) return
        setSpecialties(available)
        setCompanies(reachable)
      } catch {
        if (!active) return
        setSpecialties([])
        setCompanies([])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [insuranceProviderId])

  useEffect(() => {
    if (specialtyId.length === 0) {
      setProfessionals([])
      return
    }

    let active = true

    async function load(): Promise<void> {
      try {
        // Solo los habilitados en esa especialidad (D13): un kinesiólogo no
        // aparece para hacer una visita de clínica médica.
        const eligible = await getProfessionals(specialtyId)
        if (active) setProfessionals(eligible)
      } catch {
        if (active) setProfessionals([])
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

    const parsed = createCareServiceSchema.safeParse({
      specialtyId,
      contractingCompanyId,
      professionalId: professionalId.length === 0 ? null : professionalId,
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    setSubmitting(true)

    try {
      await createCareService({ episodeId, ...parsed.data })
      onCreated()
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo agregar la prestación. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-l-2 border-action bg-field-raised px-4 py-3.5"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <p className="m-0 text-[12px] uppercase tracking-[0.13em] text-light-faint">
        Nueva prestación
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`add-specialty-${episodeId}`} className={LABEL_CLASSES}>
            Especialidad
          </label>
          <select
            id={`add-specialty-${episodeId}`}
            value={specialtyId}
            onChange={(event) => {
              // El profesional depende de la especialidad: cambiarla invalida
              // al que estaba elegido.
              setSpecialtyId(event.target.value)
              setProfessionalId('')
            }}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí una
            </option>
            {specialties.map((specialty) => (
              <option key={specialty.id} value={specialty.id} className="bg-field-raised">
                {specialty.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`add-company-${episodeId}`} className={LABEL_CLASSES}>
            Se le reclama a
          </label>
          <select
            id={`add-company-${episodeId}`}
            value={contractingCompanyId}
            onChange={(event) => setContractingCompanyId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí la empresa
            </option>
            {companies.map((company) => (
              <option key={company.id} value={company.id} className="bg-field-raised">
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`add-professional-${episodeId}`} className={LABEL_CLASSES}>
            Profesional
          </label>
          <select
            id={`add-professional-${episodeId}`}
            value={professionalId}
            disabled={specialtyId.length === 0}
            onChange={(event) => setProfessionalId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" className="bg-field-raised">
              {specialtyId.length === 0 ? 'Elegí primero la especialidad' : 'Sin asignar'}
            </option>
            {professionals.map((professional) => (
              <option
                key={professional.id}
                value={professional.id}
                className="bg-field-raised"
              >
                {professionalName(professional)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="m-0 max-w-[58ch] text-[12px] text-unauthorized">
        Nace sin autorización. Va a figurar como tal en el tablero hasta que cargues
        la que la empresa otorgue.
      </p>

      {failure !== null && (
        <p role="alert" className="m-0 text-[12.5px] text-expired">
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-expired"
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
          className="cursor-pointer border-0 bg-action px-4 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {submitting ? 'Agregando…' : 'Agregar prestación'}
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
