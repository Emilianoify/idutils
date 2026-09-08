import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChangeInsuranceProviderForm from '@/components/patients/ChangeInsuranceProviderForm'
import { ApiError } from '@/lib/api/client'

/**
 * Cambiar de obra social no es corregir un dato.
 *
 * Es un HECHO del negocio con tres consecuencias en una transacción: cierra la
 * afiliación anterior, cierra el episodio abierto y arranca la nueva. La
 * pantalla tiene que decir eso ANTES de que el operador confirme — descubrir
 * que se cerró el episodio después es exactamente lo que rompe la confianza en
 * el sistema.
 */

const { changeInsuranceProvider, getInsuranceProviders } = vi.hoisted(() => ({
  changeInsuranceProvider: vi.fn(),
  getInsuranceProviders: vi.fn(),
}))

vi.mock('@/lib/api/patients', () => ({ changeInsuranceProvider }))
vi.mock('@/lib/api/catalogs', () => ({ getInsuranceProviders }))

const PROVIDER = { id: '11111111-1111-4111-8111-111111111111', name: 'Swiss Medical' }

function renderForm(hasOpenEpisode: boolean, onChanged = vi.fn()): void {
  render(
    <ChangeInsuranceProviderForm
      patientId="p-1"
      currentProviderName="OSDE"
      hasOpenEpisode={hasOpenEpisode}
      onChanged={onChanged}
      onCancel={vi.fn()}
    />,
  )
}

async function fillAndSubmit(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('option', { name: 'Swiss Medical' })).toBeDefined()
  })

  fireEvent.change(screen.getByLabelText('Obra social nueva'), {
    target: { value: PROVIDER.id },
  })
  fireEvent.change(screen.getByLabelText('N.º de afiliado'), {
    target: { value: '  4400  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar el cambio' }))
}

describe('change insurance provider', () => {
  beforeEach(() => {
    changeInsuranceProvider.mockReset()
    getInsuranceProviders.mockReset()
    getInsuranceProviders.mockResolvedValue([PROVIDER])
  })

  afterEach(cleanup)

  it('warns that the open episode will be closed, before confirming', async () => {
    renderForm(true)

    await waitFor(() => {
      expect(screen.getByText(/cierra el episodio abierto/)).toBeDefined()
    })
    expect(changeInsuranceProvider).not.toHaveBeenCalled()
  })

  it('does not mention closing an episode when there is none open', async () => {
    renderForm(false)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Swiss Medical' })).toBeDefined()
    })
    expect(screen.queryByText(/cierra el episodio abierto/)).toBeNull()
  })

  it('sends the trimmed member number and reports the derived queue', async () => {
    changeInsuranceProvider.mockResolvedValue({
      affiliationId: 'a-2',
      status: 'PENDIENTE_REAUTORIZACION',
    })

    renderForm(true)
    await fillAndSubmit()

    await waitFor(() => {
      expect(changeInsuranceProvider).toHaveBeenCalledWith('p-1', {
        insuranceProviderId: PROVIDER.id,
        // Un espacio al final convertiría al mismo afiliado en dos.
        memberNumber: '4400',
        changedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })
    })

    // La bandeja se dice en el momento, no se descubre tres días después.
    expect(await screen.findByText('Reautorizar')).toBeDefined()
  })

  it('shows the backend message when the member number belongs to someone else', async () => {
    changeInsuranceProvider.mockRejectedValue(
      new ApiError(
        409,
        'Ya hay un paciente con ese número de afiliado en esa obra social. Buscalo en el listado y vinculá la afiliación, o corregí el número',
      ),
    )

    renderForm(false)
    await fillAndSubmit()

    // Se muestra tal cual: el mensaje del backend dice QUÉ HACER.
    expect(await screen.findByText(/Buscalo en el listado y vinculá la afiliación/)).toBeDefined()
  })
})
