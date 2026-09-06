/**
 * El error que la capa de aplicacion tira y la de interfaces traduce.
 *
 * Lleva `statusCode` porque el caso de uso es el que sabe si "no existe" es un
 * 404 o un 409; el controller no tiene con que decidirlo. Lo que NO hace es
 * saber de Express: es un Error comun, y un cron o un comando de CLI lo puede
 * atrapar igual.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public override readonly message: string,
    /**
     * Detalle estructurado para el frontend: que campos fallaron, que
     * violaciones del dominio se encontraron. Un formulario necesita saber
     * cual de los tres errores corregir, no un parrafo.
     */
    public readonly details?: readonly string[],
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}
