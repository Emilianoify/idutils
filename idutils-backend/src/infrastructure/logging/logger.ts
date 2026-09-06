import winston from 'winston'

/**
 * El log del servidor.
 *
 * Regla que no se negocia: ACA NO ENTRA UN CUERPO DE REQUEST. Por el sistema
 * circulan datos financieros de profesionales (`taxId`, `bankAccount`,
 * `bankAlias`) y datos de salud de pacientes. Un `logger.error(..., req.body)`
 * puesto para depurar un martes deja esos datos escritos en disco para
 * siempre, y en un contenedor van directo a la salida estandar.
 *
 * Se loguea QUE fallo y DONDE. El dato que lo causo se reproduce, no se
 * archiva.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // JSON en una linea: en Docker el log es la salida estandar, y cualquier
    // recolector lo lee sin configurar un parser a mano.
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
})
