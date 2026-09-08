import Link from 'next/link'
import { fullName, STATUS_PRESENTATION } from '@/lib/domain/patient'
import { ABSENT } from '@/lib/format/dateOnly'
import type { PatientSummary } from '@/lib/api/patients'

/**
 * El listado con el que se decide vincular o crear.
 *
 * Muestra la obra social y el número de afiliado en la misma fila que el
 * nombre, y no en la ficha: son el par que identifica a la persona (D8). Un
 * listado que solo muestra nombres es el Excel con otro tipo de letra.
 *
 * El estado llega DERIVADO del backend. Acá se pinta, no se calcula.
 */

interface PatientsTableProps {
  patients: readonly PatientSummary[]
}

export default function PatientsTable({
  patients,
}: PatientsTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-field-line text-[11px] uppercase tracking-[0.15em] text-light-faint">
            <th scope="col" className="px-3 py-2.5 font-medium">
              Paciente
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Documento
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Obra social
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              N.º de afiliado
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Estado
            </th>
          </tr>
        </thead>

        <tbody>
          {patients.map((patient) => {
            const presentation = STATUS_PRESENTATION[patient.status]

            return (
              <tr
                key={patient.id}
                className="border-b border-field-line last:border-b-0 hover:bg-field-raised"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/patients/${patient.id}`}
                    className="font-medium text-light underline-offset-4 hover:underline"
                  >
                    {fullName(patient)}
                  </Link>
                </td>
                <td className="tabular px-3 py-3 text-light-muted">
                  {patient.documentNumber ?? ABSENT}
                </td>
                <td className="px-3 py-3 text-light-muted">
                  {/* Sin obra social no es un dato que falta: es un paciente sin
                      cobertura vigente, y se lee distinto que un campo vacío. */}
                  {patient.insuranceProviderName ?? (
                    <span className="text-unauthorized">Sin cobertura</span>
                  )}
                </td>
                <td className="tabular px-3 py-3 text-light-muted">
                  {patient.memberNumber ?? ABSENT}
                </td>
                <td className={`px-3 py-3 ${presentation.tone}`}>{presentation.label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
