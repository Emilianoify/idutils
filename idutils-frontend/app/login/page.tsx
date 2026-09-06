import type { Metadata } from 'next'
import { CoverageStrip } from '@/components/auth/CoverageStrip'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Ingreso · IDUtils',
}

const CORE_FEATURES = [
  'Pacientes y cobertura',
  'Episodios de internación',
  'Prestaciones y autorizaciones',
  'Vencimientos y reclamos',
  'Bandejas de trabajo',
] as const

/**
 * Los módulos opcionales llevan su estado real.
 *
 * Ninguno está construido. Ponerlos sin marcar sería prometer algo que no
 * existe en la pantalla donde alguien decide si confía en el sistema.
 */
const OPTIONAL_MODULES = [
  'Amanda, auditorías',
  'Importación de padrones',
  'Recorridos',
] as const

const GROUP_TITLE_CLASSES =
  'border-b border-field-line pb-[9px] text-[11px] uppercase tracking-[0.15em] text-light-faint'

const GROUP_LIST_CLASSES =
  'm-0 flex list-none flex-col gap-1.5 p-0 text-sm text-light-muted'

export default function LoginPage(): React.ReactElement {
  return (
    <main className="grid min-h-screen grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)] max-md:grid-cols-1">
      {/* --- El campo: qué es esto y para qué sirve --------------------- */}
      <section className="flex min-w-0 flex-col gap-[clamp(30px,3.4vw,48px)] border-r border-field-line bg-field p-[clamp(32px,4.4vw,72px)] max-md:border-r-0">
        <div
          className="rise flex flex-wrap items-baseline gap-3.5"
          style={{ '--delay': '40ms' } as React.CSSProperties}
        >
          <div className="optical-mark font-display text-[25px] font-semibold tracking-[-0.015em] text-light">
            ID<span className="text-covered">Utils</span>
          </div>
          <div className="text-[11.5px] uppercase tracking-[0.13em] text-light-faint">
            Coordinación de internación domiciliaria
          </div>
        </div>

        {/* El titular y la bajada son UN grupo con gap propio. Nunca un margen
            negativo contra tipografía que escala con clamp(): a cierto ancho se
            pisan, y el bug aparece solo en algunas pantallas. */}
        <div
          className="rise flex flex-col gap-5"
          style={{ '--delay': '110ms' } as React.CSSProperties}
        >
          <h1 className="optical-display m-0 max-w-[15ch] text-balance font-display text-[clamp(34px,4.1vw,55px)] font-medium leading-[1.08] tracking-[-0.024em] text-light">
            Sabés qué vence y <span className="text-expiring">a quién reclamarlo</span>.
          </h1>
          <p className="m-0 max-w-[46ch] text-[15.5px] text-light-muted">
            Tus pacientes, sus episodios y cada prestación con su autorización.
            Ordenado por lo que se cae primero, no por fecha de carga.
          </p>
        </div>

        <div className="rise" style={{ '--delay': '180ms' } as React.CSSProperties}>
          <CoverageStrip />
        </div>

        <div
          className="rise grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-[clamp(22px,2.6vw,44px)]"
          style={{ '--delay': '250ms' } as React.CSSProperties}
        >
          <div className="flex flex-col gap-[9px]">
            <div className={GROUP_TITLE_CLASSES}>En el núcleo</div>
            <ul className={GROUP_LIST_CLASSES}>
              {CORE_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-[9px]">
            <div className={GROUP_TITLE_CLASSES}>Módulos, por licencia</div>
            <ul className={GROUP_LIST_CLASSES}>
              {OPTIONAL_MODULES.map((module) => (
                <li key={module} className="flex justify-between gap-3.5">
                  {module}
                  <span className="whitespace-nowrap text-[11.5px] text-light-faint">
                    en desarrollo
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --- El panel: la superficie de trabajo ------------------------- */}
      <section className="flex min-w-0 flex-col justify-center bg-panel p-[clamp(32px,3.6vw,64px)] text-ink max-md:order-first max-md:border-b max-md:border-panel-line">
        <div className="mx-auto flex w-full max-w-[372px] flex-col gap-7">
          <div className="flex flex-col gap-[7px]">
            <h2 className="optical-heading m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              Iniciar sesión
            </h2>
            <p className="m-0 max-w-[40ch] text-[13.5px] text-ink-muted">
              Tu cuenta la crea la administración de tu coordinación. Si no podés
              entrar, pedile que la revise.
            </p>
          </div>

          <LoginForm />

          <div className="flex gap-[13px] border-t border-panel-line pt-5 text-[12.5px] leading-normal text-ink-muted">
            <span className="w-0.5 flex-none bg-action" />
            <p className="m-0 max-w-[40ch]">
              Del otro lado hay{' '}
              <strong className="font-semibold text-ink">
                historias clínicas de personas reales
              </strong>
              . Tu usuario es tuyo: no lo prestes, y cerrá la sesión en cualquier
              máquina que no sea la tuya.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
