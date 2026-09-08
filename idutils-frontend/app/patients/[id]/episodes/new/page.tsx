'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import OpenEpisodeForm from '@/components/episodes/OpenEpisodeForm'
import PageHeader from '@/components/shell/PageHeader'
import {
  getContractingCompanies,
  getSpecialties,
  type ContractingCompany,
  type Specialty,
} from '@/lib/api/catalogs'
import { ApiError } from '@/lib/api/client'
import { getPatient, type Affiliation, type PatientDetail } from '@/lib/api/patients'
import { fullName } from '@/lib/domain/patient'

/**
 * Abrir un episodio para un paciente.
 *
 * El episodio cuelga de la AFILIACIÓN vigente, no del paciente suelto: es la
 * cobertura la que se le reclama a la empresa. Por eso la ficha se carga
 * primero y, si el paciente no tiene afiliación abierta, no hay formulario que
 * mostrar — lo que corresponde ahí es un cambio de obra social, no un episodio.
 *
 * Las empresas se piden filtradas por esa obra social (D2), no enteras.
 */

interface Ready {
  patient: PatientDetail
  affiliation: Affiliation
  specialties: readonly Specialty[]
  companies: readonly ContractingCompany[]
}

export default function NewEpisodePage(): React.ReactElement {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [ready, setReady] = useState<Ready | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const patient = await getPatient(id)
        if (!active) return

        const affiliation = patient.affiliations.find((item) => item.isCurrent) ?? null
        if (affiliation === null) {
          setBlocked(
            'Este paciente no tiene una cobertura vigente. Un episodio se abre sobre una afiliación abierta: primero hay que registrar el cambio de obra social.',
          )
          return
        }

        const openEpisode = patient.episodes.find((episode) => episode.endsOn === null)
        if (openEpisode !== undefined) {
          setBlocked(
            'Este paciente ya tiene un episodio abierto. Dos episodios no se pueden solapar: primero hay que cerrar el que está en curso, con su motivo.',
          )
          return
        }

        const [specialties, companies] = await Promise.all([
          getSpecialties(),
          getContractingCompanies(affiliation.insuranceProviderId),
        ])

        if (!active) return
        setReady({ patient, affiliation, specialties, companies })
      } catch (error) {
        if (!active) return

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          router.replace('/login')
          return
        }

        setFailure(
          error instanceof ApiError ? error.message : 'No se pudo preparar el episodio',
        )
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [id, router])

  const back = { href: `/patients/${id}`, label: 'Ficha del paciente' }

  if (failure !== null || blocked !== null) {
    return (
      <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
        <PageHeader title="Abrir episodio" back={back} />
        <p
          role="alert"
          className={`max-w-[62ch] border-l-2 pl-4 text-light ${
            failure !== null ? 'border-expired' : 'border-expiring'
          }`}
        >
          {failure ?? blocked}
        </p>
      </main>
    )
  }

  if (ready === null) {
    return (
      <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
        <PageHeader title="Abrir episodio" back={back} />
        <p className="text-light-faint">Cargando…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
      <PageHeader
        title={`Abrir episodio · ${fullName(ready.patient)}`}
        lead={`Cobertura: ${ready.affiliation.insuranceProviderName} · ${ready.affiliation.memberNumber}. Las prestaciones se cargan acá mismo: el episodio y lo que se le hace al paciente son el mismo hecho.`}
        back={back}
      />

      <OpenEpisodeForm
        patientId={ready.patient.id}
        affiliationId={ready.affiliation.id}
        insuranceProviderName={ready.affiliation.insuranceProviderName}
        specialties={ready.specialties}
        companies={ready.companies}
        onOpened={() => router.push(`/patients/${id}`)}
      />
    </main>
  )
}
