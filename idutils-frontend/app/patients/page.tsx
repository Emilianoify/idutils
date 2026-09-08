'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import PatientsTable from '@/components/patients/PatientsTable'
import PageHeader from '@/components/shell/PageHeader'
import { ApiError } from '@/lib/api/client'
import { searchPatients, type PatientPage } from '@/lib/api/patients'

/**
 * El listado de pacientes.
 *
 * El pedido se hace en el NAVEGADOR y no en el servidor de Next: la cookie de
 * sesión la tiene el navegador. Un componente de servidor pidiendo a la API
 * llegaría sin credenciales y comería un 401.
 *
 * La búsqueda la resuelve el BACKEND, no un filtro en memoria sobre la ventana
 * traída. Filtrar acá solo encontraría a los pacientes de la página actual, y
 * el operador leería "no existe" sobre alguien que sí está cargado.
 */

const PAGE_SIZE = 20

/** Lo que se espera a que el operador deje de tipear antes de preguntar. */
const SEARCH_DEBOUNCE_MS = 300

export default function PatientsPage(): React.ReactElement {
  const router = useRouter()
  const [text, setText] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<PatientPage | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const handleFailure = useCallback(
    (error: unknown): void => {
      // 401 o 403 no es un error para mostrar: es que no hay sesión.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        router.replace('/login')
        return
      }

      setFailure(
        error instanceof ApiError ? error.message : 'No se pudo cargar el listado',
      )
    },
    [router],
  )

  useEffect(() => {
    let active = true
    setLoading(true)

    const timer = setTimeout(() => {
      async function load(): Promise<void> {
        try {
          const result = await searchPatients({ text, limit: PAGE_SIZE, offset })
          if (!active) return
          setPage(result)
          setFailure(null)
        } catch (error) {
          if (!active) return
          handleFailure(error)
        } finally {
          if (active) setLoading(false)
        }
      }

      void load()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      // Se cancela el pedido pendiente y se ignora el que ya salió: sin esto,
      // una respuesta lenta de una búsqueda vieja pisa a la nueva.
      active = false
      clearTimeout(timer)
    }
  }, [text, offset, handleFailure])

  function search(value: string): void {
    setText(value)
    // Cambiar el texto sin volver al principio dejaría al operador mirando la
    // página 3 de un resultado que tiene una sola.
    setOffset(0)
  }

  const total = page?.total ?? 0
  const shown = page?.items.length ?? 0
  const hasPrevious = offset > 0
  const hasNext = offset + shown < total

  return (
    <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
      <PageHeader
        title="Pacientes"
        lead="Buscá por apellido, nombre o documento antes de dar de alta: el mismo paciente cargado dos veces son dos historias a medias."
        back={{ href: '/dashboard', label: 'Tablero' }}
        actions={
          <Link
            href="/patients/new"
            className="bg-action px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-action-bright"
          >
            Dar de alta
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-[7px]">
          <label
            htmlFor="patient-search"
            className="text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint"
          >
            Buscar
          </label>
          <input
            id="patient-search"
            type="search"
            value={text}
            onChange={(event) => search(event.target.value)}
            placeholder="Apellido, nombre o documento"
            className="w-[min(360px,80vw)] border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors placeholder:text-light-faint focus:border-action focus:outline-none"
          />
        </div>

        <p className="tabular m-0 text-[12.5px] text-light-faint">
          {total === 0 ? 'Sin resultados' : `${total} paciente${total === 1 ? '' : 's'}`}
        </p>
      </div>

      {failure !== null && (
        <p
          role="alert"
          className="mb-6 max-w-[62ch] border-l-2 border-expired pl-4 text-light"
        >
          {failure}
        </p>
      )}

      {loading && page === null && <p className="text-light-faint">Cargando…</p>}

      {page !== null && page.items.length === 0 && failure === null && (
        <p className="max-w-[62ch] text-light-faint">
          {text.length === 0
            ? 'Todavía no hay pacientes cargados. El alta empieza por la obra social y el número de afiliado.'
            : 'Ningún paciente coincide con esa búsqueda. Antes de darlo de alta, probá con el documento.'}
        </p>
      )}

      {page !== null && page.items.length > 0 && <PatientsTable patients={page.items} />}

      {(hasPrevious || hasNext) && (
        <nav className="mt-6 flex items-center gap-4 text-[13px]">
          <button
            type="button"
            disabled={!hasPrevious}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="cursor-pointer border-0 bg-transparent p-0 text-light-faint underline-offset-4 hover:text-light hover:underline disabled:cursor-default disabled:opacity-40 disabled:hover:no-underline"
          >
            ← Anteriores
          </button>
          <span className="tabular text-light-faint">
            {offset + 1}–{offset + shown} de {total}
          </span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="cursor-pointer border-0 bg-transparent p-0 text-light-faint underline-offset-4 hover:text-light hover:underline disabled:cursor-default disabled:opacity-40 disabled:hover:no-underline"
          >
            Siguientes →
          </button>
        </nav>
      )}
    </main>
  )
}
