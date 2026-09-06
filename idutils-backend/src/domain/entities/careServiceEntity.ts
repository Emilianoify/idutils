import type { Authorization } from './authorizationEntity.js'

/**
 * La prestacion: la entidad central del sistema (D6).
 *
 * Los catalogos no vencen. Lo que vence es "kinesiologia de Juan Perez, por
 * SanityCare, la hace Yolanda, del 1/8 al 30/9". Todo el dashboard son
 * consultas sobre esta entidad; ninguna sale de los catalogos.
 */
export interface CareService {
  id: string
  /** Cuelga del episodio, NO del paciente (D9). */
  episodeId: string
  specialtyId: string
  /** Quien la contrata y a quien se le reclama. Entra en la clave de unicidad. */
  contractingCompanyId: string
  /** null = todavia sin asignar. La prestacion existe igual. */
  professionalId: string | null
  /** Baja individual de la prestacion sin cerrar el episodio. */
  endedOn: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * La prestacion con su historia de autorizaciones.
 *
 * Es lo que necesita el dashboard, y la razon por la que el vencimiento NO se
 * calcula en SQL: la regla vive en `coverageAt` y se aplica una sola vez, sobre
 * estos datos. Una query que decida "por vencer" por su cuenta seria una
 * segunda implementacion de la regla mas importante del sistema, y el dia que
 * cambie el umbral van a quedar diciendo cosas distintas.
 *
 * Se banca de sobra: una coordinacion de 10 pacientes no tiene un problema de
 * volumen, tiene un problema de memoria (D0).
 */
export type CareServiceWithAuthorizations = CareService & {
  authorizations: Authorization[]
}
