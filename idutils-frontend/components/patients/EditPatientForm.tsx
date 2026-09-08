'use client'

import { useEffect, useState } from 'react'
import {
  getLocalitiesByProvince,
  getProvinces,
  type Locality,
  type Province,
} from '@/lib/api/catalogs'
import { ApiError } from '@/lib/api/client'
import { updatePatient, type PatientDetail, type UpdatePatientBody } from '@/lib/api/patients'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { toDateInputValue } from '@/lib/format/dateOnly'
import { updatePatientSchema } from '@/lib/schemas/patient'

/**
 * Corregir datos mal cargados. No es cambiar el estado del paciente.
 *
 * Se manda SOLO lo que cambió, y por eso el formulario compara contra la ficha
 * original antes de enviar: un PATCH con la ficha entera reescribiría campos
 * que nadie tocó, y el día que dos operadores editen a la vez el segundo pisa
 * al primero sin enterarse.
 *
 * Lo que NO está acá, a propósito: la obra social —tiene su propio endpoint
 * porque cierra el episodio abierto— y el estado, que no es una columna sino
 * algo derivado de los episodios.
 */

interface EditPatientFormProps {
  patient: PatientDetail
  onSaved: () => void
  onCancel: () => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[8px] text-[14px] text-light transition-colors focus:border-action focus:outline-none disabled:opacity-45'

const LABEL_CLASSES =
  'text-[11px] font-medium uppercase tracking-[0.11em] text-light-faint'

/** Las claves que el PATCH puede llevar, para comparar sin repetirlas a mano. */
const EDITABLE = [
  'lastName',
  'firstName',
  'documentNumber',
  'birthDate',
  'addressStreet',
  'addressDetail',
  'localityId',
  'notes',
] as const

export default function EditPatientForm({
  patient,
  onSaved,
  onCancel,
}: EditPatientFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [provinces, setProvinces] = useState<readonly Province[]>([])
  const [localities, setLocalities] = useState<readonly Locality[]>([])
  const [provinceId, setProvinceId] = useState('')

  const [values, setValues] = useState({
    lastName: patient.lastName,
    firstName: patient.firstName,
    documentNumber: patient.documentNumber ?? '',
    birthDate: patient.birthDate === null ? '' : toDateInputValue(patient.birthDate),
    addressStreet: patient.addressStreet,
    addressDetail: patient.addressDetail ?? '',
    localityId: patient.localityId,
    notes: patient.notes,
  })

  const [submitting, setSubmitting] = useState(false)
  const [issues, setIssues] = useState<readonly string[]>([])
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const list = await getProvinces()
        if (active) setProvinces(list)
      } catch {
        if (active) setProvinces([])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (provinceId.length === 0) {
      setLocalities([])
      return
    }

    let active = true

    async function load(): Promise<void> {
      try {
        const list = await getLocalitiesByProvince(provinceId)
        if (active) setLocalities(list)
      } catch {
        if (active) setLocalities([])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [provinceId])

  function set(field: keyof typeof values, value: string): void {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIssues([])
    setFailure(null)

    const parsed = updatePatientSchema.safeParse({
      ...values,
      birthDate: values.birthDate.length === 0 ? null : values.birthDate,
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    // Solo lo que efectivamente cambió. Mandar la ficha entera reescribiría
    // campos que nadie tocó.
    const original: UpdatePatientBody = {
      lastName: patient.lastName,
      firstName: patient.firstName,
      documentNumber: patient.documentNumber,
      birthDate: patient.birthDate === null ? null : toDateInputValue(patient.birthDate),
      addressStreet: patient.addressStreet,
      addressDetail: patient.addressDetail,
      localityId: patient.localityId,
      notes: patient.notes,
    }

    const changes: UpdatePatientBody = {}
    for (const key of EDITABLE) {
      if (parsed.data[key] !== original[key]) {
        Object.assign(changes, { [key]: parsed.data[key] })
      }
    }

    if (Object.keys(changes).length === 0) {
      setIssues(['No cambiaste nada todavía'])
      return
    }

    setSubmitting(true)

    try {
      await updatePatient(patient.id, changes)
      onSaved()
    } catch (error) {
      if (error instanceof ApiError) {
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudieron guardar los cambios. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4 border-l-2 border-action bg-field-raised p-4"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <p className="m-0 text-[12px] uppercase tracking-[0.13em] text-light-faint">
        Corregir datos
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-lastName" className={LABEL_CLASSES}>
            Apellido
          </label>
          <input
            id="edit-lastName"
            type="text"
            value={values.lastName}
            onChange={(event) => set('lastName', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-firstName" className={LABEL_CLASSES}>
            Nombre
          </label>
          <input
            id="edit-firstName"
            type="text"
            value={values.firstName}
            onChange={(event) => set('firstName', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-documentNumber" className={LABEL_CLASSES}>
            Documento
          </label>
          <input
            id="edit-documentNumber"
            type="text"
            inputMode="numeric"
            value={values.documentNumber}
            onChange={(event) => set('documentNumber', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-birthDate" className={LABEL_CLASSES}>
            Nacimiento
          </label>
          <input
            id="edit-birthDate"
            type="date"
            value={values.birthDate}
            onChange={(event) => set('birthDate', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-addressStreet" className={LABEL_CLASSES}>
            Domicilio
          </label>
          <input
            id="edit-addressStreet"
            type="text"
            value={values.addressStreet}
            onChange={(event) => set('addressStreet', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-addressDetail" className={LABEL_CLASSES}>
            Piso, depto. o timbre
          </label>
          <input
            id="edit-addressDetail"
            type="text"
            value={values.addressDetail}
            onChange={(event) => set('addressDetail', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-province" className={LABEL_CLASSES}>
            Provincia
          </label>
          <select
            id="edit-province"
            value={provinceId}
            onChange={(event) => setProvinceId(event.target.value)}
            className={FIELD_CLASSES}
          >
            {/* La localidad actual ya está guardada: solo hace falta elegir
                provincia si se la quiere CAMBIAR. */}
            <option value="" className="bg-field-raised">
              Sin cambios
            </option>
            {provinces.map((province) => (
              <option key={province.id} value={province.id} className="bg-field-raised">
                {province.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-locality" className={LABEL_CLASSES}>
            Localidad
          </label>
          <select
            id="edit-locality"
            value={localities.some((l) => l.id === values.localityId) ? values.localityId : ''}
            disabled={provinceId.length === 0}
            onChange={(event) => set('localityId', event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              {provinceId.length === 0 ? 'Elegí primero la provincia' : 'Elegí una'}
            </option>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id} className="bg-field-raised">
                {locality.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-notes" className={LABEL_CLASSES}>
            Notas
          </label>
          <input
            id="edit-notes"
            type="text"
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      <p className="m-0 max-w-[62ch] text-[12px] text-light-faint">
        La obra social no se corrige acá: cambiarla cierra el episodio abierto, y por
        eso tiene su propio paso.
      </p>

      {failure !== null && (
        <p role="alert" className="m-0 border-l-2 border-expired pl-3 text-[12.5px] text-light">
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-0.5 border-l-2 border-expired p-0 pl-3 text-[12.5px] text-light"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting || !hydrated}
          className="cursor-pointer border-0 bg-action px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
        >
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
