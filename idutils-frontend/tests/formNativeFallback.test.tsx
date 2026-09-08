import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/components/auth/LoginForm'
import AffiliationLookupStep from '@/components/patients/AffiliationLookupStep'

/**
 * El envío nativo no puede filtrar los campos por la URL.
 *
 * Entre que el navegador pinta el HTML y que React hidrata, el formulario ya se
 * puede enviar pero `onSubmit` todavía no está enganchado. Ahí manda el envío
 * NATIVO del navegador, y un `<form>` sin `method` es un GET contra la URL
 * actual: los campos terminan en la barra de direcciones, en el historial del
 * dispositivo, en los logs de cualquier proxy y en el `Referer` de los pedidos
 * siguientes.
 *
 * Pasó de verdad: desde otro dispositivo por wifi el bundle tarda, y el login
 * terminó en `/login?email=...&password=...`. En localhost no se ve porque el
 * JavaScript gana la carrera.
 *
 * Estos tests fijan el atributo. Son la barandilla, no la explicación.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api/auth', () => ({ login: vi.fn() }))
vi.mock('@/lib/api/patients', () => ({ lookupAffiliation: vi.fn() }))

describe('native submit fallback', () => {
  afterEach(cleanup)

  it('posts the login form instead of putting credentials in the query string', () => {
    const { container } = render(<LoginForm />)
    const form = container.querySelector('form')

    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')).toBe('post')
  })

  it('posts the affiliation lookup instead of leaking the member number', () => {
    const { container } = render(
      <AffiliationLookupStep insuranceProviders={[]} onAvailable={vi.fn()} />,
    )
    const form = container.querySelector('form')

    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')).toBe('post')
  })
})
