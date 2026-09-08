import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AffiliationLookupStep from '@/components/patients/AffiliationLookupStep'

/**
 * La puerta de D8.
 *
 * Estos tests no prueban un componente: prueban la regla que evita el paciente
 * duplicado. Si `found: true` dejara pasar al alta, el sistema aceptaría dos
 * personas con la misma afiliación vigente y el índice único parcial del
 * backend rebotaría tres pantallas más adelante, con la ficha ya cargada.
 */

const { lookupAffiliation } = vi.hoisted(() => ({ lookupAffiliation: vi.fn() }))

vi.mock('@/lib/api/patients', () => ({ lookupAffiliation }))

const PROVIDERS = [{ id: '11111111-1111-4111-8111-111111111111', name: 'OSDE' }]

function renderStep(onAvailable = vi.fn()): { onAvailable: ReturnType<typeof vi.fn> } {
  render(
    <AffiliationLookupStep insuranceProviders={PROVIDERS} onAvailable={onAvailable} />,
  )
  return { onAvailable }
}

function fillAndSubmit(memberNumber: string): void {
  const provider = PROVIDERS[0]
  if (provider === undefined) throw new Error('fixture sin obra social')

  fireEvent.change(screen.getByLabelText('Obra social'), {
    target: { value: provider.id },
  })
  fireEvent.change(screen.getByLabelText('N.º de afiliado'), {
    target: { value: memberNumber },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Verificar afiliación' }))
}

describe('affiliation lookup step', () => {
  beforeEach(() => {
    lookupAffiliation.mockReset()
  })

  // `vitest.config.ts` no activa `globals`, así que la limpieza automática de
  // testing-library no se engancha: sin esto, el segundo test encuentra dos
  // formularios en el DOM y falla por ambigüedad, no por la regla.
  afterEach(cleanup)

  it('blocks the alta and names the patient who already holds the affiliation', async () => {
    lookupAffiliation.mockResolvedValue({
      found: true,
      patient: {
        id: 'abc',
        lastName: 'Pérez',
        firstName: 'Ana',
        documentNumber: '20111222',
        status: 'ACTIVO',
        insuranceProviderName: 'OSDE',
        memberNumber: '900',
      },
    })

    const { onAvailable } = renderStep()
    fillAndSubmit('900')

    // Se nombra a la persona y se enlaza su ficha: el operador tiene que poder
    // decidir si es la misma, y para eso necesita verla.
    const link = await screen.findByRole('link', { name: 'Pérez, Ana' })
    expect(link).toHaveProperty('href', expect.stringContaining('/patients/abc'))
    expect(onAvailable).not.toHaveBeenCalled()
  })

  it('unlocks the alta with the verified pair when the affiliation is free', async () => {
    lookupAffiliation.mockResolvedValue({ found: false, patient: null })

    const { onAvailable } = renderStep()
    fillAndSubmit('  900  ')

    await waitFor(() => {
      expect(onAvailable).toHaveBeenCalledWith({
        insuranceProviderId: PROVIDERS[0]?.id,
        // El número viaja recortado, igual que lo valida el backend: un espacio
        // al final convertiría al mismo afiliado en dos.
        memberNumber: '900',
      })
    })
  })

  it('does not call the API when the form is incomplete', () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Verificar afiliación' }))

    expect(lookupAffiliation).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeDefined()
  })
})
