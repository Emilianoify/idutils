/**
 * La bandeja de trabajo (D9, consecuencia 3).
 *
 * El motivo de cierre no es un dato: es lo que decide que aparece como
 * pendiente. Si el paciente internado desaparece de la pantalla, volvimos a que
 * la coordinadora se acuerde de memoria, que es exactamente el problema que
 * IDUtils vino a resolver.
 */
export const WorkQueue = {
  /** Internado en sanatorio. SIN FECHA: nadie sabe cuando vuelve. */
  ESPERANDO_ALTA: 'ESPERANDO_ALTA',
  /** Se cayo la cobertura y el paciente sigue estando. Hay que reautorizar. */
  REAUTORIZAR: 'REAUTORIZAR',
  /** No hay nada que hacer: alta medica, baja voluntaria, mudanza. */
  CERRADO: 'CERRADO',
  /** Fallecimiento. No es una bandeja de trabajo, es archivo. */
  ARCHIVO: 'ARCHIVO',
} as const

export type WorkQueue = (typeof WorkQueue)[keyof typeof WorkQueue]

/** Las que el operador tiene que mirar. `CERRADO` y `ARCHIVO` no se muestran como pendientes. */
export function isPending(queue: WorkQueue): boolean {
  return queue === WorkQueue.ESPERANDO_ALTA || queue === WorkQueue.REAUTORIZAR
}
