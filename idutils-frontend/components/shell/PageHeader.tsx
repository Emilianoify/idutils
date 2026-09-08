import Link from 'next/link'

/**
 * La cabecera de las pantallas de trabajo.
 *
 * No trae la sesión adentro. Cada pantalla que necesita saber quién está
 * mirando la pide por su cuenta; una cabecera que resolviera `currentUser()`
 * obligaría a esperar esa llamada para dibujar el título, y el título no
 * depende de quién sos.
 */

interface PageHeaderProps {
  title: string
  /** El renglón que explica de qué se trata la pantalla. */
  lead?: string
  /** A dónde vuelve el operador. */
  back?: { href: string; label: string }
  actions?: React.ReactNode
}

export default function PageHeader({
  title,
  lead,
  back,
  actions,
}: PageHeaderProps): React.ReactElement {
  return (
    <header className="mb-8 border-b border-field-line pb-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <Link
            href="/dashboard"
            className="optical-mark font-display text-[25px] font-semibold tracking-[-0.015em] text-light"
          >
            ID<span className="text-covered">Utils</span>
          </Link>
          {back !== undefined && (
            <Link
              href={back.href}
              className="text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
            >
              ← {back.label}
            </Link>
          )}
        </div>

        {actions}
      </div>

      <h1 className="optical-display m-0 max-w-[24ch] text-balance font-display text-[clamp(24px,2.8vw,34px)] font-medium leading-[1.12] tracking-[-0.02em] text-light">
        {title}
      </h1>

      {lead !== undefined && (
        <p className="m-0 mt-2.5 max-w-[62ch] text-[13.5px] text-light-faint">{lead}</p>
      )}
    </header>
  )
}
