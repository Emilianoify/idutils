'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import AffiliationLookupStep from '@/components/patients/AffiliationLookupStep'
import NewPatientForm from '@/components/patients/NewPatientForm'
import PageHeader from '@/components/shell/PageHeader'
import { ApiError } from '@/lib/api/client'
import {
  getInsuranceProviders,
  getProvinces,
  type InsuranceProvider,
  type Province,
} from '@/lib/api/catalogs'

/**
 * El alta de paciente, en dos pasos y en este orden.
 *
 * Primero se pregunta si la afiliación ya es de alguien (D8) y recién después
 * aparece el resto. No es una preferencia de diseño: mientras el formulario
 * completo esté a la vista, alguien lo va a llenar entero y va a descubrir el
 * duplicado al apretar el botón, con veinte campos cargados de una persona que
 * ya está en el sistema.
 *
 * El segundo paso no está escondido detrás de un `disabled`: no está montado.
 */

interface VerifiedAffiliation {
  insuranceProviderId: string
  memberNumber: string
}

export default function NewPatientPage(): React.ReactElement {
  const router = useRouter()
  const [insuranceProviders, setInsuranceProviders] = useState<
    readonly InsuranceProvider[]
  >([])
  const [provinces, setProvinces] = useState<readonly Province[]>([])
  const [verified, setVerified] = useState<VerifiedAffiliation | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        // Los dos catálogos van juntos: el segundo paso necesita las provincias
        // apenas se desbloquea, y pedirlas recién ahí dejaría el selector vacío
        // en el momento exacto en que el operador lo abre.
        const [providers, provinceList] = await Promise.all([
          getInsuranceProviders(),
          getProvinces(),
        ])

        if (!active) return
        setInsuranceProviders(providers)
        setProvinces(provinceList)
      } catch (error) {
        if (!active) return

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          router.replace('/login')
          return
        }

        setFailure(
          error instanceof ApiError
            ? error.message
            : 'No se pudieron cargar los catálogos del alta',
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [router])

  const providerName =
    verified === null
      ? ''
      : (insuranceProviders.find(
          (provider) => provider.id === verified.insuranceProviderId,
        )?.name ?? 'Obra social')

  return (
    <main className="min-h-screen bg-field p-[clamp(24px,4vw,56px)]">
      <PageHeader
        title={verified === null ? 'Antes de dar de alta' : 'Alta de paciente'}
        lead={
          verified === null
            ? 'La obra social y el número de afiliado identifican a la persona. Si ya son de alguien, no hay alta: hay una ficha que abrir.'
            : 'La afiliación está libre. Ahora sí: quién es, dónde vive y a quién se llama.'
        }
        back={{ href: '/patients', label: 'Pacientes' }}
      />

      {failure !== null && (
        <p
          role="alert"
          className="max-w-[62ch] border-l-2 border-expired pl-4 text-light"
        >
          {failure}
        </p>
      )}

      {loading && failure === null && <p className="text-light-faint">Cargando…</p>}

      {!loading && failure === null && verified === null && (
        <AffiliationLookupStep
          insuranceProviders={insuranceProviders}
          onAvailable={setVerified}
        />
      )}

      {!loading && failure === null && verified !== null && (
        <NewPatientForm
          affiliation={verified}
          insuranceProviderName={providerName}
          provinces={provinces}
          onCreated={(patient) => router.push(`/patients/${patient.id}`)}
        />
      )}
    </main>
  )
}
