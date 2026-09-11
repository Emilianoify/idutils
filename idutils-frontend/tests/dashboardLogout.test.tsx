import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/app/dashboard/page'
import type { Role } from '@/lib/domain/role'

const { replace, logout } = vi.hoisted(() => ({
  replace: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/lib/api/auth', () => ({
  currentUser: vi.fn(async () => ({
    id: '1',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'ADMIN' satisfies Role,
  })),
  logout,
}))
vi.mock('@/lib/api/dashboard', () => ({
  getDashboard: vi.fn(async () => ({
    warningDays: 30,
    // El resumen trae además la lista de reclamos y el corte por empresa; este
    // test mira el logout, así que van vacías.
    claims: [],
    byCompany: [],
    workQueues: [],
    counters: {
      activePatients: 1,
      activeCareServices: 2,
      expiringSoon: 0,
      expired: 0,
      withoutAuthorization: 0,
      pendingClaims: 0,
    },
  })),
}))

describe('dashboard logout', () => {
  beforeEach(() => {
    replace.mockReset()
    logout.mockReset()
  })

  it('keeps authenticated UI visible and shows an actionable error on server failure', async () => {
    logout.mockRejectedValueOnce(new Error('offline'))
    render(<DashboardPage />)

    const button = await screen.findByRole('button', { name: 'Cerrar sesión' })
    fireEvent.click(button)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Volvé a intentar antes de cerrar esta ventana',
    )
    expect(screen.getByText(/Ana/)).toBeDefined()
    await waitFor(() => expect(replace).not.toHaveBeenCalled())
  })
})
