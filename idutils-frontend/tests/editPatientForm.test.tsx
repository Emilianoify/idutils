import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditPatientForm from '@/components/patients/EditPatientForm'
import type { PatientDetail } from '@/lib/api/patients'

/**
 * Un PATCH manda SOLO lo que cambió.
 *
 * Reenviar la ficha entera reescribiría campos que nadie tocó, y el día que dos
 * operadores editen al mismo paciente el segundo pisa al primero sin enterarse.
 * Es la razón por la que el endpoint es PATCH y no PUT, y este formulario tiene
 * que respetarla.
 */

const { updatePatient, getProvinces, getLocalitiesByProvince } = vi.hoisted(() => ({
  updatePatient: vi.fn(),
  getProvinces: vi.fn(),
  getLocalitiesByProvince: vi.fn(),
}))

vi.mock('@/lib/api/patients', () => ({ updatePatient }))
vi.mock('@/lib/api/catalogs', () => ({ getProvinces, getLocalitiesByProvince }))

const PATIENT: PatientDetail = {
  id: 'p-1',
  lastName: 'Perez',
  firstName: 'Ana',
  documentNumber: '20111222',
  birthDate: '1948-04-12T00:00:00.000Z',
  addressStreet: 'Rivadavia 100',
  addressDetail: null,
  localityId: '22222222-2222-4222-8222-222222222222',
  notes: '',
  status: 'ACTIVO',
  workQueue: null,
  affiliations: [],
  episodes: [],
  contacts: [],
}

describe('edit patient form', () => {
  beforeEach(() => {
    updatePatient.mockReset()
    updatePatient.mockResolvedValue(PATIENT)
    getProvinces.mockResolvedValue([])
    getLocalitiesByProvince.mockResolvedValue([])
  })

  afterEach(cleanup)

  it('sends only the field that changed', async () => {
    const onSaved = vi.fn()
    render(<EditPatientForm patient={PATIENT} onSaved={onSaved} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      // Ni `firstName`, ni `documentNumber`, ni el domicilio: no se tocaron.
      expect(updatePatient).toHaveBeenCalledWith('p-1', { lastName: 'Pérez' })
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('refuses to send an empty patch', async () => {
    render(<EditPatientForm patient={PATIENT} onSaved={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No cambiaste nada todavía')).toBeDefined()
    expect(updatePatient).not.toHaveBeenCalled()
  })

  it('turns an emptied optional field into null, not into an empty string', async () => {
    render(<EditPatientForm patient={PATIENT} onSaved={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Documento'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      // El backend declara `.min(1).nullable()`: la cadena vacía REBOTA.
      expect(updatePatient).toHaveBeenCalledWith('p-1', { documentNumber: null })
    })
  })

  it('does not offer the insurance provider here', () => {
    render(<EditPatientForm patient={PATIENT} onSaved={vi.fn()} onCancel={vi.fn()} />)

    // Cambiar la cobertura cierra el episodio abierto: es otro paso.
    expect(screen.queryByLabelText('Obra social')).toBeNull()
    expect(screen.getByText(/La obra social no se corrige acá/)).toBeDefined()
  })
})
