/**
 * El estado del paciente. DERIVADO de los episodios, nunca almacenado (D9).
 *
 * Por eso este enum NO esta en schema.prisma y no existe como tipo de columna
 * en Postgres: si existiera, alguien lo escribiria, y un flag es un valor
 * barato que alguien se olvida de actualizar. La estructura no se olvida.
 *
 * Se calcula con `statusAt` de domain/services/patientStatus.ts.
 */
export const PatientStatus = {
  /** Episodio abierto y ya comenzado. */
  ACTIVO: 'ACTIVO',
  /** Episodio abierto con inicio futuro: vuelve el jueves. */
  REINGRESA: 'REINGRESA',
  /** Ultimo episodio cerrado por internacion en sanatorio. Bandeja: esperando alta. */
  INTERNADO: 'INTERNADO',
  /** Cerrado por cambio de obra social, fin de cobertura o suspension. Bandeja: reautorizar. */
  PENDIENTE_REAUTORIZACION: 'PENDIENTE_REAUTORIZACION',
  /** Cerrado por alta medica, baja voluntaria o mudanza fuera de zona. */
  BAJA: 'BAJA',
  FALLECIDO: 'FALLECIDO',
  /** Cargado en el sistema pero sin ningun episodio todavia. */
  SIN_INICIAR: 'SIN_INICIAR',
} as const

export type PatientStatus = (typeof PatientStatus)[keyof typeof PatientStatus]
