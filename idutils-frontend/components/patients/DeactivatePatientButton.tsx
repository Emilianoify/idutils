'use client'

import { useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { deactivatePatient } from '@/lib/api/patients'
import { useHydrated } from '@/lib/hooks/useHydrated'

/**
 * Dar de baja un paciente NO es darle el alta.
 *
 * Es para un paciente cargado POR ERROR: se duplicó, o se equivocaron de
 * persona. Si el paciente tiene episodios, el backend contesta 409 con el
 * mensaje que dice qué corresponde —cerrar el episodio con su motivo— y ese
 * mensaje se muestra tal cual, porque es la explicación que el operador
 * necesita leer.
 *
 * Por eso el botón pide confirmación en dos pasos y dice qué va a pasar: da de
 * baja también la afiliación, y eso libera el par (obra social, N.º de
 * afiliado) para que el paciente de verdad se pueda cargar.
 */

interface DeactivatePatientButtonProps {
  patientId: string
  patientName: string
  onDeactivated: () => void
}

export default function DeactivatePatientButton({
  patientId,
  patientName,
  onDeactivated,
}: DeactivatePatientButtonProps): React.ReactElement {
  const hydrated = useHydrated()
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function deactivate(): Promise<void> {
    setFailure(null)
    setWorking(true)

    try {
      await deactivatePatient(patientId)
      onDeactivated()
    } catch (error) {
      // El 409 de "tiene episodios" trae escrito qué hacer en su lugar.
      setFailure(
        error instanceof ApiError
          ? error.message
          : 'No se pudo dar de baja al paciente. Volvé a intentar',
      )
      setWorking(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-expired hover:underline"
        >
          Se cargó por error
        </button>

        {failure !== null && (
          <p
            role="alert"
            className="m-0 max-w-[62ch] border-l-2 border-expired pl-3 text-[12.5px] text-light"
          >
            {failure}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-l-2 border-expired bg-field-raised p-4">
      <p className="m-0 max-w-[62ch] text-[13.5px] text-light">
        Dar de baja a <b className="font-medium">{patientName}</b> por haberlo cargado
        mal.
      </p>
      <p className="m-0 max-w-[62ch] text-[12.5px] text-light-faint">
        Esto es para un duplicado o una persona equivocada, no para un paciente que
        terminó su internación — para eso se cierra el episodio con su motivo. Da de
        baja también la afiliación, y así libera el número de afiliado para el paciente
        de verdad.
      </p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={working || !hydrated}
          onClick={() => void deactivate()}
          className="cursor-pointer border border-expired bg-transparent px-4 py-2 text-[13px] font-medium text-expired transition-colors hover:bg-field disabled:cursor-progress disabled:opacity-60"
        >
          {working ? 'Dando de baja…' : 'Sí, se cargó por error'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
