'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import ClaimsList from '@/components/dashboard/ClaimsList'
import WorkQueuesList from '@/components/dashboard/WorkQueuesList'
import { currentUser, logout, type User } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { getDashboard, type DashboardSummary } from '@/lib/api/dashboard'

/**
 * El tablero, en su forma mínima: los contadores.
 *
 * Está acá para cerrar el circuito completo —ingreso, cookie, pedido
 * autenticado, dato real— y para ver los cuatro colores trabajando sobre datos
 * de verdad. El tablero de verdad, con el corte por empresa, la lista de
 * reclamos ordenada por urgencia y las bandejas, viene después.
 *
 * El pedido se hace en el NAVEGADOR y no en el servidor de Next: la cookie de
 * sesión la tiene el navegador. Un componente de servidor pidiendo a la API
 * llegaría sin credenciales y comería un 401.
 */

interface Metric {
  label: string
  value: number
  tone: string
  note: string
}

export default function DashboardPage(): React.ReactElement {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [logoutFailure, setLogoutFailure] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load(): Promise<void> {
      try {
        const [who, data] = await Promise.all([
          currentUser(),
          getDashboard(),
        ])

        if (!mounted) return
        setUser(who)
        setSummary(data)
      } catch (error) {
        if (!mounted) return

        // 401 o 403 no es un error para mostrar: es que no hay sesión. Se va al
        // ingreso en vez de dejar una pantalla rota con un mensaje técnico.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          router.replace('/login')
          return
        }

        setFailure(
          error instanceof ApiError ? error.message : 'No se pudo cargar el tablero',
        )
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [router])

  async function signOut(): Promise<void> {
    setLogoutFailure(null)
    setSigningOut(true)

    try {
      await logout()
      setUser(null)
      setSummary(null)
      router.replace('/login')
    } catch {
      setLogoutFailure(
        'No se pudo cerrar la sesión en el servidor. Volvé a intentar antes de cerrar esta ventana.',
      )
      setSigningOut(false)
    }
  }

  if (failure !== null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-field p-8">
        <p className="max-w-[46ch] border-l-2 border-expired pl-4 text-light">{failure}</p>
      </main>
    )
  }

  if (summary === null || user === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-field p-8">
        <p className="text-light-faint">Cargando…</p>
      </main>
    )
  }

  const { counters, warningDays } = summary

  const metrics: readonly Metric[] = [
    {
      label: 'Por vencer',
      value: counters.expiringSoon,
      tone: 'text-expiring',
      note: `dentro de ${warningDays} días`,
    },
    {
      label: 'Vencidas',
      value: counters.expired,
      tone: 'text-expired',
      note: 'ya sin cobertura',
    },
    {
      label: 'Sin autorización',
      value: counters.withoutAuthorization,
      tone: 'text-unauthorized',
      note: 'nunca se autorizaron',
    },
    {
      label: 'Reclamos pendientes',
      value: counters.pendingClaims,
      tone: 'text-expiring',
      note: 'todavía sin reclamar',
    },
    {
      label: 'Pacientes activos',
      value: counters.activePatients,
      tone: 'text-covered',
      note: 'con episodio abierto',
    },
    {
      label: 'Prestaciones activas',
      value: counters.activeCareServices,
      tone: 'text-covered',
      note: 'en curso hoy',
    },
  ]

  return (
    <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-field-line pb-6">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <div className="optical-mark font-display text-[25px] font-semibold tracking-[-0.015em] text-light">
            ID<span className="text-covered">Utils</span>
          </div>
          <span className="text-[11.5px] uppercase tracking-[0.13em] text-light-faint">
            {user.name} · {user.role.toLowerCase()}
          </span>
        </div>

        <div className="flex max-w-[42ch] flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            <Link
              href="/patients"
              className="text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
            >
              Pacientes
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline disabled:cursor-progress disabled:opacity-70"
            >
              {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
          {logoutFailure !== null && (
            <p role="alert" className="m-0 text-right text-[12.5px] text-expired">
              {logoutFailure}
            </p>
          )}
        </div>
      </header>

      <h1 className="optical-display m-0 mb-8 max-w-[20ch] text-balance font-display text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em] text-light">
        Esto es lo que hay que reclamar.
      </h1>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-px bg-field-line">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-1 bg-field-raised p-5">
            <div className="text-[11px] uppercase tracking-[0.15em] text-light-faint">
              {metric.label}
            </div>
            <div className={`tabular text-[38px] leading-none ${metric.tone}`}>
              {metric.value}
            </div>
            <div className="text-[12.5px] text-light-faint">{metric.note}</div>
          </div>
        ))}
      </div>

      {/* Los contadores dicen CUÁNTO. Esta lista dice A QUIÉN LLAMAR, que es la
          pregunta que el operador trae puesta cuando abre el sistema. */}
      <section className="mt-10">
        <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          A quién hay que reclamarle
        </h2>
        <ClaimsList claims={summary.claims} />
      </section>

      {/* La otra mitad: los que no están activos pero tampoco terminaron. El
          paciente internado no tiene episodio abierto y no figura en ninguna
          lista de activos — sin esta sección, desaparece. */}
      <section className="mt-10">
        <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          Quién está esperando
        </h2>
        <WorkQueuesList items={summary.workQueues} />
      </section>
    </main>
  )
}
