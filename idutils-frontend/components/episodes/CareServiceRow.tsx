'use client'

import { useEffect, useState } from 'react'
import {
  getFrequencies,
  getProfessionals,
  type ContractingCompany,
  type Frequency,
  type Professional,
  type Specialty,
} from '@/lib/api/catalogs'
import { professionalName } from '@/lib/domain/careService'

/**
 * Una prestación del episodio.
 *
 * La cascada de acá es la regla D11, no una comodidad: elegir la especialidad
 * es lo que decide QUÉ FRECUENCIAS existen. Médico Clínico no ofrece las once
 * del catálogo, ofrece las que esa especialidad habilita. Por eso los dos
 * selectores de abajo están vacíos y deshabilitados hasta que hay especialidad:
 * un selector lleno de opciones que van a rebotar es peor que uno vacío.
 *
 * La frecuencia llega con su etiqueta ya armada —"2 visitas semanales"— porque
 * el sustantivo lo pone la especialidad y esa regla vive en el backend. Acá se
 * muestra, no se compone.
 */

export interface CareServiceDraft {
  specialtyId: string
  contractingCompanyId: string
  professionalId: string
  /** La autorización es opcional entera: o va completa, o la prestación nace sin papel. */
  withAuthorization: boolean
  frequencyId: string
  validFrom: string
  validUntil: string
  notes: string
}

export function emptyCareService(validFrom: string): CareServiceDraft {
  return {
    specialtyId: '',
    contractingCompanyId: '',
    professionalId: '',
    withAuthorization: false,
    frequencyId: '',
    validFrom,
    validUntil: '',
    notes: '',
  }
}

interface CareServiceRowProps {
  draft: CareServiceDraft
  index: number
  specialties: readonly Specialty[]
  companies: readonly ContractingCompany[]
  removable: boolean
  onChange: (patch: Partial<CareServiceDraft>) => void
  onRemove: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors placeholder:text-light-faint focus:border-action focus:outline-none disabled:opacity-45'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint'

export default function CareServiceRow({
  draft,
  index,
  specialties,
  companies,
  removable,
  onChange,
  onRemove,
}: CareServiceRowProps): React.ReactElement {
  const [frequencies, setFrequencies] = useState<readonly Frequency[]>([])
  const [professionals, setProfessionals] = useState<readonly Professional[]>([])
  const [loadingCatalogs, setLoadingCatalogs] = useState(false)

  useEffect(() => {
    if (draft.specialtyId.length === 0) {
      setFrequencies([])
      setProfessionals([])
      return
    }

    let active = true
    setLoadingCatalogs(true)

    async function load(): Promise<void> {
      try {
        const [eligible, available] = await Promise.all([
          getFrequencies(draft.specialtyId),
          getProfessionals(draft.specialtyId),
        ])

        if (!active) return
        setFrequencies(eligible)
        setProfessionals(available)
      } catch {
        // Un catálogo que no cargó deja los selectores vacíos; el schema no
        // deja confirmar sin frecuencia si la autorización está marcada.
        if (!active) return
        setFrequencies([])
        setProfessionals([])
      } finally {
        if (active) setLoadingCatalogs(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [draft.specialtyId])

  const noSpecialty = draft.specialtyId.length === 0

  return (
    <fieldset className="m-0 border-0 border-l-2 border-field-line p-0 pl-4">
      <legend className="flex items-center gap-3 p-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
        Prestación {index + 1}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer border-0 bg-transparent p-0 text-[11px] uppercase tracking-[0.13em] text-light-faint underline-offset-4 hover:text-expired hover:underline"
          >
            Quitar
          </button>
        )}
      </legend>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-[19px]">
        <div className="flex flex-col gap-[7px]">
          <label htmlFor={`specialty-${index}`} className={LABEL_CLASSES}>
            Especialidad
          </label>
          <select
            id={`specialty-${index}`}
            value={draft.specialtyId}
            onChange={(event) =>
              // Cambiar de especialidad invalida la frecuencia elegida: la
              // vieja puede no estar habilitada para la nueva. Se limpia acá
              // en vez de dejar que el backend la rechace al confirmar.
              onChange({ specialtyId: event.target.value, frequencyId: '', professionalId: '' })
            }
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí una especialidad
            </option>
            {specialties.map((item) => (
              <option key={item.id} value={item.id} className="bg-field-raised">
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor={`company-${index}`} className={LABEL_CLASSES}>
            Se le reclama a
          </label>
          <select
            id={`company-${index}`}
            value={draft.contractingCompanyId}
            onChange={(event) => onChange({ contractingCompanyId: event.target.value })}
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

        <div className="flex flex-col gap-[7px]">
          <label htmlFor={`professional-${index}`} className={LABEL_CLASSES}>
            Profesional
          </label>
          <select
            id={`professional-${index}`}
            value={draft.professionalId}
            disabled={noSpecialty || loadingCatalogs}
            onChange={(event) => onChange({ professionalId: event.target.value })}
            className={FIELD_CLASSES}
          >
            {/* Sin asignar es un estado válido, no un campo sin completar: la
                prestación existe y el profesional se asigna después. */}
            <option value="" className="bg-field-raised">
              {noSpecialty ? 'Elegí primero la especialidad' : 'Sin asignar'}
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

      <label className="mt-5 flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-light-muted">
        <input
          type="checkbox"
          checked={draft.withAuthorization}
          onChange={(event) => onChange({ withAuthorization: event.target.checked })}
          className="size-4 accent-action"
        />
        Ya tengo la autorización
      </label>

      {!draft.withAuthorization && (
        <p className="m-0 mt-2 max-w-[58ch] text-[12.5px] text-unauthorized">
          La prestación va a figurar como <b className="font-medium">sin autorización</b>,
          que no es lo mismo que vencida: existe y todavía nadie la autorizó.
        </p>
      )}

      {draft.withAuthorization && (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-[19px]">
          <div className="flex flex-col gap-[7px]">
            <label htmlFor={`frequency-${index}`} className={LABEL_CLASSES}>
              Frecuencia
            </label>
            <select
              id={`frequency-${index}`}
              value={draft.frequencyId}
              disabled={noSpecialty || loadingCatalogs}
              onChange={(event) => onChange({ frequencyId: event.target.value })}
              className={FIELD_CLASSES}
            >
              <option value="" disabled>
                {noSpecialty
                  ? 'Elegí primero la especialidad'
                  : loadingCatalogs
                    ? 'Cargando…'
                    : 'Elegí una frecuencia'}
              </option>
              {frequencies.map((frequency) => (
                <option
                  key={frequency.id}
                  value={frequency.id}
                  className="bg-field-raised"
                >
                  {frequency.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor={`valid-from-${index}`} className={LABEL_CLASSES}>
              Autorizada desde
            </label>
            <input
              id={`valid-from-${index}`}
              type="date"
              value={draft.validFrom}
              onChange={(event) => onChange({ validFrom: event.target.value })}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor={`valid-until-${index}`} className={LABEL_CLASSES}>
              Vence el
            </label>
            <input
              id={`valid-until-${index}`}
              type="date"
              value={draft.validUntil}
              onChange={(event) => onChange({ validUntil: event.target.value })}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-[7px]">
            <label htmlFor={`notes-${index}`} className={LABEL_CLASSES}>
              Notas
            </label>
            <input
              id={`notes-${index}`}
              type="text"
              value={draft.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              className={FIELD_CLASSES}
            />
          </div>
        </div>
      )}
    </fieldset>
  )
}
