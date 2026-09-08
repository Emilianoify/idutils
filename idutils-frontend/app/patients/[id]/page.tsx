'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import CareServicePanel from '@/components/careServices/CareServicePanel'
import CloseEpisodeForm from '@/components/episodes/CloseEpisodeForm'
import ChangeInsuranceProviderForm from '@/components/patients/ChangeInsuranceProviderForm'
import DeactivatePatientButton from '@/components/patients/DeactivatePatientButton'
import EditPatientForm from '@/components/patients/EditPatientForm'
import PageHeader from '@/components/shell/PageHeader'
import { ApiError } from '@/lib/api/client'
import { getPatient, type PatientDetail } from '@/lib/api/patients'
import {
  CLOSE_REASON_LABELS,
  fullName,
  QUEUE_LABELS,
  STATUS_PRESENTATION,
} from '@/lib/domain/patient'
import { ABSENT, formatDateOnly } from '@/lib/format/dateOnly'

/**
 * La ficha del paciente.
 *
 * El estado y la bandeja llegan DERIVADOS del backend, calculados a partir de
 * los episodios y su motivo de cierre (D9). Acá se muestran. Recalcularlos
 * sería tener dos implementaciones de la misma regla, y la del cliente es la
 * que se desactualiza sin que nadie se entere.
 *
 * Las afiliaciones y los episodios se muestran COMPLETOS, no solo el vigente:
 * esa sucesión es la historia con la que se defiende una auditoría. Un cambio
 * de obra social no edita la afiliación anterior, la cierra y abre otra, y por
 * eso se leen las dos.
 */

export default function PatientDetailPage(): React.ReactElement {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [changingProvider, setChangingProvider] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await getPatient(id)
      setPatient(result)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        router.replace('/login')
        return
      }

      setFailure(error instanceof ApiError ? error.message : 'No se pudo cargar la ficha')
    }
  }, [id, router])

  useEffect(() => {
    void load()
  }, [load])

  if (failure !== null) {
    return (
      <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
        <PageHeader title="Ficha" back={{ href: '/patients', label: 'Pacientes' }} />
        <p role="alert" className="max-w-[62ch] border-l-2 border-expired pl-4 text-light">
          {failure}
        </p>
      </main>
    )
  }

  if (patient === null) {
    return (
      <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
        <PageHeader title="Ficha" back={{ href: '/patients', label: 'Pacientes' }} />
        <p className="text-light-faint">Cargando…</p>
      </main>
    )
  }

  const presentation = STATUS_PRESENTATION[patient.status]
  const currentAffiliation = patient.affiliations.find((item) => item.isCurrent) ?? null
  /** Sin `endsOn` es el episodio en curso. Como mucho hay uno. */
  const openEpisode = patient.episodes.find((episode) => episode.endsOn === null) ?? null

  return (
    <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
      <PageHeader
        title={fullName(patient)}
        back={{ href: '/patients', label: 'Pacientes' }}
        actions={
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[13.5px] font-medium ${presentation.tone}`}>
              {presentation.label}
            </span>
            {patient.workQueue !== null && (
              <span className="text-[11px] uppercase tracking-[0.13em] text-light-faint">
                {QUEUE_LABELS[patient.workQueue]}
              </span>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-8">
        <section>
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
            La persona
          </h2>
          <dl className="m-0 flex flex-col gap-2.5 text-sm">
            <Row label="Documento" value={patient.documentNumber ?? ABSENT} tabular />
            <Row label="Nacimiento" value={formatDateOnly(patient.birthDate)} tabular />
            <Row label="Domicilio" value={patient.addressStreet} />
            <Row label="Detalle" value={patient.addressDetail ?? ABSENT} />
            <Row
              label="Notas"
              value={patient.notes.length === 0 ? ABSENT : patient.notes}
            />
          </dl>

          {!editing && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
              >
                Corregir datos
              </button>

              {/* La baja solo se ofrece cuando NO hay episodios: con episodios
                  el backend la rechaza, y ofrecerla sería invitar a un 409. */}
              {patient.episodes.length === 0 && (
                <DeactivatePatientButton
                  patientId={patient.id}
                  patientName={fullName(patient)}
                  onDeactivated={() => router.push('/patients')}
                />
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
            Cobertura vigente
          </h2>
          {currentAffiliation === null ? (
            <p className="m-0 max-w-[42ch] text-sm text-unauthorized">
              Sin cobertura vigente. Mientras no haya una afiliación abierta no se puede
              abrir un episodio.
            </p>
          ) : (
            <>
              <dl className="m-0 flex flex-col gap-2.5 text-sm">
                <Row label="Obra social" value={currentAffiliation.insuranceProviderName} />
                <Row label="N.º de afiliado" value={currentAffiliation.memberNumber} tabular />
                <Row label="Desde" value={formatDateOnly(currentAffiliation.from)} tabular />
              </dl>

              {!changingProvider && (
                <button
                  type="button"
                  onClick={() => setChangingProvider(true)}
                  className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-light-faint underline-offset-4 hover:text-light hover:underline"
                >
                  Cambió de obra social
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
            A quién se llama
          </h2>
          {patient.contacts.length === 0 ? (
            <p className="m-0 text-sm text-light-faint">Sin contactos cargados.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
              {patient.contacts.map((contact) => (
                <li key={contact.id}>
                  <span className="text-light">{contact.name}</span>
                  <span className="text-light-faint"> · {contact.relationship}</span>
                  <br />
                  <span className="tabular text-light-muted">{contact.phone}</span>
                  {contact.isPrimary && (
                    <span className="ml-2 text-[11px] uppercase tracking-[0.13em] text-covered">
                      Principal
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <section className="mt-8">
          <EditPatientForm
            patient={patient}
            onSaved={() => {
              setEditing(false)
              void load()
            }}
            onCancel={() => setEditing(false)}
          />
        </section>
      )}

      {changingProvider && currentAffiliation !== null && (
        <section className="mt-8">
          <ChangeInsuranceProviderForm
            patientId={patient.id}
            currentProviderName={currentAffiliation.insuranceProviderName}
            hasOpenEpisode={openEpisode !== null}
            onChanged={() => {
              setChangingProvider(false)
              // Cierra afiliación y episodio: estado y bandeja los deriva el
              // backend. Se recarga en vez de adivinar cómo quedó la ficha.
              void load()
            }}
            onCancel={() => setChangingProvider(false)}
          />
        </section>
      )}

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[11px] uppercase tracking-[0.15em] text-light-faint">
            Episodios
          </h2>

          {/* Un paciente tiene como mucho UN episodio abierto: mientras haya
              uno en curso lo que corresponde es cerrarlo, no abrir otro. */}
          {openEpisode === null
            ? currentAffiliation !== null && (
                <Link
                  href={`/patients/${patient.id}/episodes/new`}
                  className="bg-action px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-action-bright"
                >
                  Abrir episodio
                </Link>
              )
            : !closing && (
                <button
                  type="button"
                  onClick={() => setClosing(true)}
                  className="cursor-pointer border border-expiring bg-transparent px-4 py-2 text-[13px] font-medium text-expiring transition-colors hover:bg-field-raised"
                >
                  Cerrar episodio
                </button>
              )}
        </div>

        {closing && openEpisode !== null && (
          <div className="mb-5">
            <CloseEpisodeForm
              episodeId={openEpisode.id}
              onClosed={() => {
                setClosing(false)
                // El cierre cambia `status` y `workQueue`, y los dos los deriva
                // el backend. Se recarga la ficha en vez de adivinar la bandeja.
                void load()
              }}
              onCancel={() => setClosing(false)}
            />
          </div>
        )}

        {patient.episodes.length === 0 ? (
          <p className="m-0 max-w-[62ch] text-sm text-light-faint">
            Todavía no hay episodios. El paciente está cargado, pero no empezó a
            recibir prestaciones.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-px bg-field-line p-0">
            {patient.episodes.map((episode) => (
              <li
                key={episode.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-field-raised px-4 py-3 text-sm"
              >
                <span className="tabular text-light">
                  {formatDateOnly(episode.startsOn)} → {formatDateOnly(episode.endsOn)}
                </span>
                {episode.closeReason !== null && (
                  <span className="text-light-muted">
                    {CLOSE_REASON_LABELS[episode.closeReason]}
                  </span>
                )}
                {episode.endsOn === null && (
                  <span className="text-[11px] uppercase tracking-[0.13em] text-covered">
                    Abierto
                  </span>
                )}
                {episode.closeNote !== null && (
                  <span className="w-full text-[12.5px] text-light-faint">
                    {episode.closeNote}
                  </span>
                )}

                {/* Las prestaciones del episodio: qué se le está haciendo al
                    paciente y qué vence. Es la pregunta por la que existe el
                    sistema, así que va acá y no escondida un click más adentro. */}
                <div className="mt-3 w-full">
                  <CareServicePanel
                    episodeId={episode.id}
                    // La obra social sale de la afiliación DE ESE episodio, no
                    // de la vigente: un episodio viejo se cerró bajo la
                    // cobertura que tenía entonces.
                    insuranceProviderId={
                      patient.affiliations.find(
                        (affiliation) => affiliation.id === episode.affiliationId,
                      )?.insuranceProviderId ?? ''
                    }
                    mutable={episode.endsOn === null}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {patient.affiliations.length > 1 && (
        <section className="mt-10">
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
            Historia de cobertura
          </h2>
          <ul className="m-0 flex list-none flex-col gap-px bg-field-line p-0">
            {patient.affiliations.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-field-raised px-4 py-3 text-sm"
              >
                <span className="text-light">{item.insuranceProviderName}</span>
                <span className="tabular text-light-muted">{item.memberNumber}</span>
                <span className="tabular text-light-faint">
                  {formatDateOnly(item.from)} → {formatDateOnly(item.to)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function Row({
  label,
  value,
  tabular = false,
}: {
  label: string
  value: string
  tabular?: boolean
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="min-w-[11ch] text-[12.5px] text-light-faint">{label}</dt>
      <dd className={`m-0 text-light ${tabular ? 'tabular' : ''}`}>{value}</dd>
    </div>
  )
}
