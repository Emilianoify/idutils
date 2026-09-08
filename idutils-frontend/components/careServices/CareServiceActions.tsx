'use client'

import { useEffect, useState } from 'react'
import { getProfessionals, type Professional } from '@/lib/api/catalogs'
import { assignProfessional, endCareService } from '@/lib/api/careServices'
import { ApiError } from '@/lib/api/client'
import { professionalName } from '@/lib/domain/careService'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { endCareServiceSchema } from '@/lib/schemas/careService'

/**
 * Asignar profesional y terminar la prestación.
 *
 * Son dos operaciones muy distintas y por eso no comparten botón:
 *
 *   ASIGNAR   cambia quién la hace. Se puede desasignar: "sin asignar" es un
 *             estado real del negocio, no un campo a medio llenar.
 *   TERMINAR  cierra ESTA prestación. El episodio sigue abierto y las demás
 *             siguen corriendo — se cayó kinesiología y enfermería continúa.
 *
 * Se dice "terminar" y no "dar de baja" a propósito: "baja" ya significa otras
 * cosas en el sistema —el paciente cargado por error, el motivo de cierre— y
 * una palabra que significa cuatro cosas no significa ninguna.
 *
 * Terminar la prestación NO es cerrar el episodio. Cerrar el episodio es un
 * hecho sobre el paciente entero, con su motivo, y decide en qué bandeja queda.
 */

interface CareServiceActionsProps {
  careServiceId: string
  specialtyId: string
  currentProfessionalName: string | null
  onChanged: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[6px] text-[13px] text-light transition-colors focus:border-action focus:outline-none'

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export default function CareServiceActions({
  careServiceId,
  specialtyId,
  currentProfessionalName,
  onChanged,
}: CareServiceActionsProps): React.ReactElement {
  const hydrated = useHydrated()
  const [mode, setMode] = useState<'idle' | 'assign' | 'end'>('idle')
  const [professionals, setProfessionals] = useState<readonly Professional[]>([])
  const [professionalId, setProfessionalId] = useState('')
  const [endedOn, setEndedOn] = useState(today())
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'assign') return

    let active = true

    async function load(): Promise<void> {
      try {
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
  }, [mode, specialtyId])

  async function run(action: () => Promise<void>, fallback: string): Promise<void> {
    setFailure(null)
    setWorking(true)

    try {
      await action()
      setMode('idle')
      onChanged()
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : fallback)
      setWorking(false)
    }
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setMode('assign')}
          className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          {currentProfessionalName === null ? 'Asignar profesional' : 'Cambiar profesional'}
        </button>
        <button
          type="button"
          onClick={() => setMode('end')}
          className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-light-faint underline-offset-4 hover:text-expired hover:underline"
        >
          Terminar esta prestación
        </button>
        {failure !== null && (
          <span role="alert" className="text-[12.5px] text-expired">
            {failure}
          </span>
        )}
      </div>
    )
  }

  if (mode === 'assign') {
    return (
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`assign-${careServiceId}`}
            className="text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint"
          >
            Profesional
          </label>
          <select
            id={`assign-${careServiceId}`}
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
            className={FIELD_CLASSES}
          >
            {/* Desasignar es una operación válida: la prestación existe igual. */}
            <option value="" className="bg-field-raised">
              Sin asignar
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

        <button
          type="button"
          disabled={working || !hydrated}
          onClick={() =>
            void run(
              () =>
                assignProfessional(
                  careServiceId,
                  professionalId.length === 0 ? null : professionalId,
                ),
              'No se pudo actualizar el profesional',
            )
          }
          className="cursor-pointer border-0 bg-action px-4 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {working ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setMode('idle')}
          className="cursor-pointer border-0 bg-transparent p-0 pb-2 text-[12.5px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Cancelar
        </button>

        {failure !== null && (
          <span role="alert" className="pb-2 text-[12.5px] text-expired">
            {failure}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`end-${careServiceId}`}
          className="text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint"
        >
          Termina el
        </label>
        <input
          id={`end-${careServiceId}`}
          type="date"
          value={endedOn}
          onChange={(event) => setEndedOn(event.target.value)}
          className={FIELD_CLASSES}
        />
      </div>

      <button
        type="button"
        disabled={working || !hydrated}
        onClick={() => {
          const parsed = endCareServiceSchema.safeParse({ endedOn })
          if (!parsed.success) {
            setFailure(parsed.error.issues[0]?.message ?? 'Revisá la fecha')
            return
          }

          void run(
            () => endCareService(careServiceId, parsed.data.endedOn),
            'No se pudo terminar la prestación',
          )
        }}
        className="cursor-pointer border border-expired bg-transparent px-4 py-1.5 text-[12.5px] font-medium text-expired transition-colors hover:bg-field disabled:cursor-progress disabled:opacity-60"
      >
        {working ? 'Terminando…' : 'Confirmar'}
      </button>
      <button
        type="button"
        onClick={() => setMode('idle')}
        className="cursor-pointer border-0 bg-transparent p-0 pb-2 text-[12.5px] text-light-faint underline-offset-4 hover:text-light hover:underline"
      >
        Cancelar
      </button>

      <p className="m-0 w-full max-w-[58ch] text-[12px] text-light-faint">
        Termina solo esta prestación. El episodio sigue abierto y las demás siguen
        corriendo.
      </p>

      {failure !== null && (
        <p role="alert" className="m-0 w-full text-[12.5px] text-expired">
          {failure}
        </p>
      )}
    </div>
  )
}
