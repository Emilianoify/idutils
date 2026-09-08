'use client'

import Link from 'next/link'
import type { WorkQueueItem } from '@/lib/api/dashboard'
import { CLOSE_REASON_LABELS, QUEUE_LABELS, WorkQueue } from '@/lib/domain/patient'
import { formatDateOnly } from '@/lib/format/dateOnly'

/**
 * Los pacientes que no están activos pero tampoco terminaron.
 *
 * Es la mitad del sistema que nadie recuerda hasta que falta. Un paciente
 * internado en sanatorio no tiene episodio abierto y no aparece en ninguna
 * lista de activos — y sin embargo hay que llamar al sanatorio la semana que
 * viene para saber si le dieron el alta. Si desaparece de la pantalla, volvimos
 * a que la coordinadora se acuerde de memoria (D0).
 *
 * `CERRADO` y `ARCHIVO` no llegan acá: el backend solo manda las bandejas con
 * trabajo pendiente. Un alta médica no es algo que haya que hacer.
 */

interface WorkQueuesListProps {
  items: readonly WorkQueueItem[]
}

/** Qué hay que hacer con cada bandeja, dicho en imperativo. */
const QUEUE_ACTIONS: Partial<Record<WorkQueue, string>> = {
  ESPERANDO_ALTA: 'Preguntar al sanatorio si ya le dieron el alta',
  REAUTORIZAR: 'Conseguir la cobertura nueva para poder reabrir',
}

const QUEUE_TONES: Partial<Record<WorkQueue, string>> = {
  ESPERANDO_ALTA: 'border-expiring text-expiring',
  REAUTORIZAR: 'border-expired text-expired',
}

export default function WorkQueuesList({
  items,
}: WorkQueuesListProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <p className="m-0 max-w-[62ch] text-[13.5px] text-light-faint">
        No hay pacientes esperando. Ninguno quedó internado ni sin cobertura.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-px bg-field-line">
      {items.map((item) => {
        const tone = QUEUE_TONES[item.queue] ?? 'border-field-line text-light-faint'

        return (
          <article
            key={item.episodeId}
            className={`flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-l-2 bg-field-raised px-4 py-3 ${tone.split(' ')[0] ?? ''}`}
          >
            <div className="min-w-0">
              <Link
                href={`/patients/${item.patientId}`}
                className="text-[14.5px] font-medium text-light underline-offset-4 hover:underline"
              >
                {item.patientName}
              </Link>
              <span className="text-[13px] text-light-muted">
                {' · '}
                {CLOSE_REASON_LABELS[item.closeReason]}
              </span>
              <p className="m-0 mt-0.5 text-[12.5px] text-light-faint">
                {QUEUE_ACTIONS[item.queue] ?? 'Revisar'}
                {item.closeNote !== null && ` · ${item.closeNote}`}
              </p>
            </div>

            <div className="text-right">
              <div className={`text-[12.5px] font-medium ${tone.split(' ')[1] ?? ''}`}>
                {QUEUE_LABELS[item.queue]}
              </div>
              {/* La antigüedad es el dato accionable: no hay fecha de vuelta,
                  pero sí "hace once días que nadie pregunta". */}
              <div className="tabular text-[12.5px] text-light-faint">
                hace {item.daysWaiting} {item.daysWaiting === 1 ? 'día' : 'días'}
              </div>
              <div className="tabular text-[11.5px] text-light-faint">
                cerró el {formatDateOnly(item.closedOn)}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
