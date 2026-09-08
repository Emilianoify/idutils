'use client'

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api/client'
import {
  getLocalitiesByProvince,
  type Locality,
  type Province,
} from '@/lib/api/catalogs'
import { createPatient, type PatientSummary } from '@/lib/api/patients'
import { useHydrated } from '@/lib/hooks/useHydrated'
import {
  createPatientDetailsSchema,
  type PatientContactInput,
} from '@/lib/schemas/patient'

/**
 * El resto del alta, una vez que la afiliación resultó libre.
 *
 * La obra social y el número de afiliado llegan por props, ya verificados: si
 * el formulario los volviera a pedir, el operador podría cambiarlos después del
 * lookup y se guardaría un par que nunca se verificó.
 *
 * La localidad es una FK al catálogo, nunca texto libre (D12). Se pide la
 * provincia primero porque el backend no devuelve "todas las localidades": son
 * 24 provincias con miles de localidades, y un selector con todas adentro deja
 * de ser un selector.
 */

interface VerifiedAffiliation {
  insuranceProviderId: string
  memberNumber: string
}

interface NewPatientFormProps {
  affiliation: VerifiedAffiliation
  insuranceProviderName: string
  provinces: readonly Province[]
  onCreated: (patient: PatientSummary) => void
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-field-line bg-transparent px-0.5 py-[9px] text-[15px] text-light transition-colors placeholder:text-light-faint focus:border-action focus:outline-none'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-light-faint'

/** Hoy en `YYYY-MM-DD`, en el huso local: es la fecha que el operador ve en su reloj. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const EMPTY_CONTACT: PatientContactInput = {
  name: '',
  relationship: '',
  phone: '',
  isPrimary: true,
}

/** `FormData.get` devuelve `File | string | null`; el schema espera texto. */
function textField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export default function NewPatientForm({
  affiliation,
  insuranceProviderName,
  provinces,
  onCreated,
}: NewPatientFormProps): React.ReactElement {
  const hydrated = useHydrated()
  const [provinceId, setProvinceId] = useState('')
  const [localities, setLocalities] = useState<readonly Locality[]>([])
  const [loadingLocalities, setLoadingLocalities] = useState(false)
  const [contacts, setContacts] = useState<PatientContactInput[]>([EMPTY_CONTACT])
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [issues, setIssues] = useState<readonly string[]>([])

  useEffect(() => {
    if (provinceId.length === 0) {
      setLocalities([])
      return
    }

    let active = true
    setLoadingLocalities(true)

    async function load(): Promise<void> {
      try {
        const result = await getLocalitiesByProvince(provinceId)
        if (active) setLocalities(result)
      } catch {
        // Un catálogo que no cargó no rompe el formulario entero: el selector
        // queda vacío y el schema no deja seguir sin localidad.
        if (active) setLocalities([])
      } finally {
        if (active) setLoadingLocalities(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [provinceId])

  function updateContact(index: number, patch: Partial<PatientContactInput>): void {
    setContacts((current) =>
      current.map((contact, position) =>
        position === index ? { ...contact, ...patch } : contact,
      ),
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFailure(null)
    setIssues([])

    const formData = new FormData(event.currentTarget)

    // Un contacto en blanco no es un contacto a medio cargar: es que no lo
    // cargaron. Se descarta antes de validar, en vez de devolverle al operador
    // tres mensajes por una fila que nunca quiso llenar.
    const filledContacts = contacts.filter(
      (contact) =>
        contact.name.trim().length > 0 ||
        contact.relationship.trim().length > 0 ||
        contact.phone.trim().length > 0,
    )

    const birthDate = textField(formData, 'birthDate')

    const parsed = createPatientDetailsSchema.safeParse({
      lastName: textField(formData, 'lastName'),
      firstName: textField(formData, 'firstName'),
      documentNumber: textField(formData, 'documentNumber'),
      birthDate: birthDate.length === 0 ? null : birthDate,
      addressStreet: textField(formData, 'addressStreet'),
      addressDetail: textField(formData, 'addressDetail'),
      localityId: textField(formData, 'localityId'),
      notes: textField(formData, 'notes'),
      from: textField(formData, 'from'),
      contacts: filledContacts,
    })

    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => issue.message))
      return
    }

    const { from, contacts: validContacts, ...details } = parsed.data
    setSubmitting(true)

    try {
      const created = await createPatient({
        ...details,
        contacts: validContacts,
        affiliation: { ...affiliation, from },
      })
      onCreated(created)
    } catch (error) {
      if (error instanceof ApiError) {
        // `details` trae TODAS las violaciones, no la primera: es lo que
        // permite marcar los tres campos juntos en vez de uno por intento.
        setFailure(error.message)
        setIssues(error.details)
      } else {
        setFailure('No se pudo dar de alta al paciente. Volvé a intentar')
      }
      setSubmitting(false)
    }
  }

  return (
    // `method="post"`: antes de hidratar, un envío hace el submit NATIVO, y
    // un form sin `method` es un GET contra la URL actual. Toda la ficha del
    // paciente terminaría en la barra de direcciones y en el historial.
    <form
      className="flex max-w-[76ch] flex-col gap-8"
      method="post"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <section className="border-l-2 border-covered bg-field-raised p-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          Afiliación verificada
        </p>
        <p className="m-0 mt-1.5 text-[14px] text-light">
          {insuranceProviderName} ·{' '}
          <span className="tabular">{affiliation.memberNumber}</span>
        </p>
        <p className="m-0 mt-2 text-[12.5px] text-light-faint">
          Nadie más la tiene vigente. El paciente nace con su cobertura: son un solo
          hecho, y por eso se guardan juntos.
        </p>
      </section>

      <fieldset className="m-0 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-6 gap-y-[19px] border-0 p-0">
        <legend className="mb-3 p-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          La persona
        </legend>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="lastName" className={LABEL_CLASSES}>
            Apellido
          </label>
          <input id="lastName" name="lastName" type="text" className={FIELD_CLASSES} />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="firstName" className={LABEL_CLASSES}>
            Nombre
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            defaultValue=""
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="documentNumber" className={LABEL_CLASSES}>
            Documento
          </label>
          <input
            id="documentNumber"
            name="documentNumber"
            type="text"
            inputMode="numeric"
            defaultValue=""
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="birthDate" className={LABEL_CLASSES}>
            Fecha de nacimiento
          </label>
          <input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue=""
            className={FIELD_CLASSES}
          />
        </div>
      </fieldset>

      <fieldset className="m-0 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-6 gap-y-[19px] border-0 p-0">
        <legend className="mb-3 p-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          Dónde vive
        </legend>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="addressStreet" className={LABEL_CLASSES}>
            Domicilio
          </label>
          <input
            id="addressStreet"
            name="addressStreet"
            type="text"
            placeholder="Calle y número"
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="addressDetail" className={LABEL_CLASSES}>
            Piso, depto. o timbre
          </label>
          <input
            id="addressDetail"
            name="addressDetail"
            type="text"
            defaultValue=""
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="provinceId" className={LABEL_CLASSES}>
            Provincia
          </label>
          <select
            id="provinceId"
            name="provinceId"
            value={provinceId}
            onChange={(event) => setProvinceId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Elegí una provincia
            </option>
            {provinces.map((province) => (
              <option key={province.id} value={province.id} className="bg-field-raised">
                {province.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="localityId" className={LABEL_CLASSES}>
            Localidad
          </label>
          <select
            id="localityId"
            name="localityId"
            defaultValue=""
            disabled={provinceId.length === 0 || loadingLocalities}
            className={`${FIELD_CLASSES} disabled:opacity-50`}
          >
            <option value="" disabled>
              {provinceId.length === 0
                ? 'Elegí primero la provincia'
                : loadingLocalities
                  ? 'Cargando…'
                  : 'Elegí una localidad'}
            </option>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id} className="bg-field-raised">
                {locality.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          A quién se llama
        </legend>

        <div className="flex flex-col gap-5">
          {contacts.map((contact, index) => (
            <div
              // El índice ES la identidad acá: son filas de un borrador todavía
              // sin id, y no se reordenan.
              key={index}
              className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-[19px]"
            >
              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`contact-name-${index}`} className={LABEL_CLASSES}>
                  Nombre
                </label>
                <input
                  id={`contact-name-${index}`}
                  type="text"
                  value={contact.name}
                  onChange={(event) => updateContact(index, { name: event.target.value })}
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-[7px]">
                <label
                  htmlFor={`contact-relationship-${index}`}
                  className={LABEL_CLASSES}
                >
                  Vínculo
                </label>
                <input
                  id={`contact-relationship-${index}`}
                  type="text"
                  value={contact.relationship}
                  placeholder="Hijo, esposa, cuidadora"
                  onChange={(event) =>
                    updateContact(index, { relationship: event.target.value })
                  }
                  className={FIELD_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`contact-phone-${index}`} className={LABEL_CLASSES}>
                  Teléfono
                </label>
                <input
                  id={`contact-phone-${index}`}
                  type="tel"
                  value={contact.phone}
                  onChange={(event) => updateContact(index, { phone: event.target.value })}
                  className={FIELD_CLASSES}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setContacts((current) => [...current, { ...EMPTY_CONTACT, isPrimary: false }])
          }
          className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
        >
          + Agregar otro contacto
        </button>
      </fieldset>

      <fieldset className="m-0 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-x-6 gap-y-[19px] border-0 p-0">
        <legend className="mb-3 p-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
          El alta
        </legend>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="from" className={LABEL_CLASSES}>
            La cobertura rige desde
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={today()}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="notes" className={LABEL_CLASSES}>
            Notas
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            defaultValue=""
            className={FIELD_CLASSES}
          />
        </div>
      </fieldset>

      {failure !== null && (
        <p
          role="alert"
          className="m-0 border-l-2 border-expired pl-4 text-[13.5px] text-light"
        >
          {failure}
        </p>
      )}

      {issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-1 border-l-2 border-expired pl-4 text-[13px] text-light"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting || !hydrated}
        className="w-fit cursor-pointer border-0 bg-action px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-action-bright disabled:cursor-progress disabled:opacity-60"
      >
        {submitting ? 'Dando de alta…' : 'Dar de alta'}
      </button>
    </form>
  )
}
