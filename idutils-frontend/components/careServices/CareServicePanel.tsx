'use client'

import { useCallback, useEffect, useState } from 'react'
import AddCareServiceForm from '@/components/careServices/AddCareServiceForm'
import CareServiceCard from '@/components/careServices/CareServiceCard'
import {
  listEpisodeCareServices,
  type CareServiceTimeline,
} from '@/lib/api/careServices'
import { ApiError } from '@/lib/api/client'

/**
 * Las prestaciones de un episodio.
 *
 * Se piden aparte de la ficha y no vienen adentro de ella a propósito: la ficha
 * responde "quién es y qué le pasó", y esto responde "qué se le está haciendo y
 * qué vence". Son dos preguntas distintas y la segunda cambia mucho más seguido.
 *
 * `mutable` es del episodio, no de la prestación: con el episodio cerrado la
 * historia se lee, no se toca.
 */

interface CareServicePanelProps {
  episodeId: string
  /**
   * La obra social del episodio. Filtra las empresas con convenio (D2), y por
   * eso viaja desde la ficha: la afiliación la conoce ella, no esta lista.
   */
  insuranceProviderId: string
  mutable: boolean
}

export default function CareServicePanel({
  episodeId,
  insuranceProviderId,
  mutable,
}: CareServicePanelProps): React.ReactElement {
  const [careServices, setCareServices] = useState<CareServiceTimeline[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      setCareServices(await listEpisodeCareServices(episodeId))
      setFailure(null)
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : 'No se pudieron cargar las prestaciones',
      )
    }
  }, [episodeId])

  useEffect(() => {
    void load()
  }, [load])

  if (failure !== null) {
    return (
      <p role="alert" className="m-0 max-w-[62ch] border-l-2 border-expired pl-4 text-[13px] text-light">
        {failure}
      </p>
    )
  }

  if (careServices === null) {
    return <p className="m-0 text-[13px] text-light-faint">Cargando prestaciones…</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {careServices.length === 0 && !adding && (
        <p className="m-0 max-w-[62ch] text-[13px] text-light-faint">
          Este episodio no tiene prestaciones cargadas. El episodio está abierto, pero
          todavía no hay nada que vencer ni que reclamar.
        </p>
      )}

      {careServices.length > 0 && (
        <div className="flex flex-col gap-px bg-field-line">
          {careServices.map((careService) => (
            <CareServiceCard
              key={careService.careServiceId}
              careService={careService}
              mutable={mutable}
              // Reclamar, renovar, asignar y terminar cambian el estado
              // DERIVADO de la cobertura, y lo deriva el backend. Se recarga en
              // vez de adivinar cómo quedó.
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}

      {mutable && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          + Agregar prestación
        </button>
      )}

      {adding && (
        <AddCareServiceForm
          episodeId={episodeId}
          insuranceProviderId={insuranceProviderId}
          onCreated={() => {
            setAdding(false)
            void load()
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}
