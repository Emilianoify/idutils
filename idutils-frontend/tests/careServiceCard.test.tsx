import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CareServiceCard from '@/components/careServices/CareServiceCard'
import type { CareServiceTimeline } from '@/lib/api/careServices'

/**
 * Reclamar NO es autorizar.
 *
 * Son dos hechos distintos del negocio y la interfaz no puede mezclarlos:
 * reclamar deja constancia de que se pidió la renovación, y la prestación
 * SIGUE VENCIENDO porque nadie autorizó nada. Confundirlas es como el sistema
 * termina diciendo que algo está autorizado porque alguien mandó un WhatsApp.
 *
 * Y `needsClaim` lo decide el backend con `coverageAt`: esta pantalla ofrece el
 * botón cuando el servidor dice que hay que reclamar, no cuando ella lo deduce.
 */

const { claimAuthorization } = vi.hoisted(() => ({ claimAuthorization: vi.fn() }))

vi.mock('@/lib/api/careServices', () => ({ claimAuthorization }))
vi.mock('@/lib/api/catalogs', () => ({ getFrequencies: vi.fn(async () => []) }))

function timeline(overrides: Partial<CareServiceTimeline> = {}): CareServiceTimeline {
  return {
    careServiceId: 'cs-1',
    specialtyId: 'sp-1',
    specialtyName: 'Kinesiología motora',
    professionalName: 'Gómez, Yolanda',
    contractingCompanyName: 'SanityCare',
    endedOn: null,
    episodeEndsOn: null,
    episodeFinished: false,
    status: 'POR_VENCER',
    daysUntilExpiry: 12,
    uncoveredSince: null,
    claimableAuthorizationId: 'auth-1',
    needsClaim: true,
    authorizations: [
      {
        id: 'auth-1',
        frequencyId: 'f-1',
        frequencyLabel: '2 sesiones semanales',
        validFrom: '2026-08-01T00:00:00.000Z',
        validUntil: '2026-09-30T00:00:00.000Z',
        claimedAt: null,
        notes: '',
      },
    ],
    ...overrides,
  }
}

describe('care service card', () => {
  beforeEach(() => {
    claimAuthorization.mockReset()
    claimAuthorization.mockResolvedValue(undefined)
  })

  afterEach(cleanup)

  it('claims the authorization the backend pointed at, not one it picked', async () => {
    const onChanged = vi.fn()
    render(
      <CareServiceCard
        careService={timeline({ claimableAuthorizationId: 'auth-1' })}
        mutable
        onChanged={onChanged}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dejar constancia del reclamo' }))

    await waitFor(() => {
      expect(claimAuthorization).toHaveBeenCalledWith('auth-1')
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('does not offer the claim when the backend says it is not needed', () => {
    render(
      <CareServiceCard
        careService={timeline({ status: 'VIGENTE', needsClaim: false, daysUntilExpiry: 55 })}
        mutable
        onChanged={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Dejar constancia del reclamo' }),
    ).toBeNull()
    // Cargar la autorización que la empresa otorgó sigue disponible: es el otro
    // hecho, y no depende de que haya algo para reclamar.
    expect(screen.getByRole('button', { name: 'Cargar autorización' })).toBeDefined()
  })

  it('offers nothing to change once the episode is closed', () => {
    render(
      <CareServiceCard careService={timeline()} mutable={false} onChanged={vi.fn()} />,
    )

    expect(
      screen.queryByRole('button', { name: 'Dejar constancia del reclamo' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cargar autorización' })).toBeNull()
  })

  /**
   * Una prestación de un episodio CERRADO es historia, no presente.
   *
   * El backend calcula su cobertura contra el día del cierre, no contra hoy.
   * Sin esto, un episodio cerrado en marzo mostraba "Vigente · vence en 55
   * días" en septiembre — afirmando que a ese paciente se le sigue haciendo
   * algo. Era el defecto que el usuario vio en la ficha.
   */
  it('reads a closed episode as history instead of as something running', () => {
    render(
      <CareServiceCard
        careService={timeline({
          episodeEndsOn: '2026-03-31T00:00:00.000Z',
          episodeFinished: true,
          status: 'VIGENTE',
          needsClaim: false,
          daysUntilExpiry: 55,
        })}
        mutable={false}
        onChanged={vi.fn()}
      />,
    )

    expect(screen.getByText('Al cierre: vigente')).toBeDefined()
    expect(screen.getByText(/El episodio cerró el 31\/03\/2026/)).toBeDefined()
    // Lo que NO tiene que decir: que vence dentro de 55 días.
    expect(screen.queryByText(/Vence en 55 días/)).toBeNull()
  })

  it('shows a claimed authorization as claimed, still not authorized', () => {
    render(
      <CareServiceCard
        careService={timeline({
          needsClaim: false,
          authorizations: [
            {
              id: 'auth-1',
              frequencyId: 'f-1',
              frequencyLabel: '2 sesiones semanales',
              validFrom: '2026-08-01T00:00:00.000Z',
              validUntil: '2026-09-30T00:00:00.000Z',
              claimedAt: '2026-09-05T00:00:00.000Z',
              notes: '',
            },
          ],
        })}
        mutable
        onChanged={vi.fn()}
      />,
    )

    // Sigue POR_VENCER: reclamar no movió el vencimiento ni un día.
    expect(screen.getByText('Por vencer')).toBeDefined()
    expect(screen.getByText('reclamada el 05/09/2026')).toBeDefined()
  })
})
