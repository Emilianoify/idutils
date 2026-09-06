import type { Affiliation } from '../entities/affiliationEntity.js'

export type NewAffiliation = Omit<
  Affiliation,
  'id' | 'to' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export interface IAffiliationRepository {
  findById(id: string): Promise<Affiliation | null>

  /**
   * La afiliacion VIGENTE con ese numero, si existe.
   *
   * Es la consulta que dispara la decision de D8: si devuelve algo, ese
   * paciente ya esta; si devuelve null, el operador tiene que buscar en el
   * listado y decidir si vincula o crea.
   *
   * `memberNumber` tiene que venir ya pasado por `normalizeMemberNumber`. Si se
   * consulta con el valor crudo, el indice unico parcial no encuentra nada y el
   * sistema deja duplicar en silencio.
   */
  findCurrentByMemberNumber(
    insuranceProviderId: string,
    memberNumber: string,
  ): Promise<Affiliation | null>

  /** Todas las del paciente, mas nueva primero. Es su historial de cobertura. */
  listByPatient(patientId: string): Promise<Affiliation[]>

  /** La vigente del paciente, o null si esta sin cobertura. */
  findCurrentByPatient(patientId: string): Promise<Affiliation | null>

  create(affiliation: NewAffiliation): Promise<Affiliation>

  /**
   * Cierra la afiliacion con fecha `to`.
   *
   * Cerrar una afiliacion CIERRA TAMBIEN EL EPISODIO abierto (D9): la obra
   * social nueva puede autorizar otras especialidades y otras frecuencias. Esa
   * coordinacion es de la capa de aplicacion, en una sola transaccion.
   */
  close(id: string, to: Date): Promise<Affiliation>

  /**
   * Baja logica de la afiliacion. NO es lo mismo que cerrarla.
   *
   * Cerrar (`close`) dice "esta cobertura estuvo vigente hasta el 30/9": es un
   * hecho del negocio. Dar de baja dice "esta fila nunca tendria que haber
   * existido": es una carga equivocada.
   *
   * Existe por una razon concreta y no por simetria. El indice unico parcial
   * de `core_invariants.sql` filtra por `"to" IS NULL AND "deletedAt" IS NULL`,
   * asi que una afiliacion que solo se cierra libera el par (obra social,
   * N de afiliado) igual que una dada de baja... pero deja en el historial una
   * cobertura que nunca existio. Para el paciente cargado por error, la baja
   * logica es la unica que dice la verdad.
   */
  softDelete(id: string): Promise<void>
}
