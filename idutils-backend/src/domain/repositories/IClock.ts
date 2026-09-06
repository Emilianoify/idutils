/**
 * El "hoy" del sistema, como puerto.
 *
 * Existe porque medio dominio de IDUtils depende de que dia es: que esta por
 * vencer, quien esta activo, cuantos dias de ID lleva el paciente. Un caso de
 * uso que llame a `new Date()` adentro no se puede testear sin viajar en el
 * tiempo, y los tests terminan pasando en agosto y fallando en septiembre.
 *
 * Devuelve fecha de negocio (Buenos Aires) a medianoche UTC, no un timestamp:
 * un cron a las 01:00 UTC ya es "ayer" para la coordinacion, y el dashboard
 * tiene que coincidir con el calendario de la pared.
 */
export interface IClock {
  today(): Date
}
