import { AuthorizationStatus, STATUS_STYLES } from '@/lib/domain/authorizationStatus'

/**
 * La tira que enseña a leer una cobertura.
 *
 * Es el elemento que hace que esta pantalla sea de IDUtils y no de cualquier
 * sistema: en vez de contar qué hace el producto, lo muestra haciéndolo. Los
 * cuatro estados aparecen con su color antes de que entres, así que cuando
 * llegás al tablero ya sabés leerlo.
 *
 * Las filas son ilustrativas: no hay pacientes ni empresas. Una pantalla de
 * ingreso no simula registros de salud.
 */

interface CoverageRow {
  specialty: string
  /** El sustantivo lo decide la especialidad, no la frecuencia (D11). */
  frequency: string | null
  status: AuthorizationStatus
  /** Porcentaje del período autorizado ya consumido. */
  consumed: number
  caption: readonly [string, string]
}

const ROWS: readonly CoverageRow[] = [
  {
    specialty: 'Enfermería',
    frequency: '3 visitas semanales',
    status: AuthorizationStatus.VIGENTE,
    consumed: 41,
    caption: ['vigente', 'hasta el 30/11'],
  },
  {
    specialty: 'Kinesiología motora',
    frequency: '2 sesiones semanales',
    status: AuthorizationStatus.POR_VENCER,
    consumed: 88,
    caption: ['vence en', '12 días'],
  },
  {
    specialty: 'Clínica médica',
    frequency: '1 visita mensual',
    status: AuthorizationStatus.VENCIDA,
    consumed: 100,
    caption: ['vencida hace', '6 días'],
  },
  {
    // Sin frecuencia porque no tiene autorización. La ausencia también es el
    // dato: el backend devuelve `frequencyLabel: null` para este estado.
    specialty: 'Fonoaudiología',
    frequency: null,
    status: AuthorizationStatus.SIN_AUTORIZACION,
    consumed: 0,
    caption: ['sin', 'autorización'],
  },
]

export function CoverageStrip(): React.ReactElement {
  return (
    <div className="flex flex-col gap-[13px]">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-light-faint">
        Así se lee una cobertura
        <span className="h-px flex-1 bg-field-line" />
      </div>

      {ROWS.map((row, index) => {
        const style = STATUS_STYLES[row.status]

        return (
          <div
            key={row.specialty}
            className={`grid grid-cols-[minmax(0,1fr)_122px] items-center gap-x-5 gap-y-2 border-l-2 bg-field-raised px-3.5 py-[11px] max-md:grid-cols-[minmax(0,1fr)_104px] ${style.border}`}
          >
            <div className="min-w-0 truncate text-sm font-medium text-light">
              {row.specialty}
              {row.frequency !== null && (
                <span className="font-normal text-light-faint"> · {row.frequency}</span>
              )}
            </div>

            <div className="relative col-start-1 h-[5px] overflow-hidden bg-field">
              {/* El aviso de 30 días: la regla del dominio, dibujada. Cuando la
                  barra cruza esta marca, la prestación entra en reclamos. */}
              <span className="absolute -top-0.5 -bottom-0.5 left-[70%] w-px bg-light-faint opacity-55" />
              <span
                className={`meter-fill absolute inset-y-0 left-0 ${style.background}`}
                style={
                  {
                    '--consumed': `${row.consumed}%`,
                    '--delay': `${340 + index * 100}ms`,
                  } as React.CSSProperties
                }
              />
            </div>

            <div
              className={`tabular col-start-2 row-span-2 row-start-1 text-right text-[12.5px] leading-tight ${style.text}`}
            >
              {row.caption[0]}
              <br />
              {row.caption[1]}
            </div>
          </div>
        )
      })}

      <p className="max-w-[52ch] text-[12.5px] text-light-faint">
        La barra es el período autorizado que ya se consumió. La marca fina es el
        aviso:{' '}
        <b className="font-medium text-light-muted">
          cuando quedan 30 días, entra en la lista de reclamos
        </b>
        . Nunca autorizada no es lo mismo que vencida, y por eso no comparten
        color.
      </p>
    </div>
  )
}
