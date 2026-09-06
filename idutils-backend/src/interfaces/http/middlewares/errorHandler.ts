import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { logger } from '../../../infrastructure/logging/logger.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import {
  sendBadRequest,
  sendError,
  sendInternalError,
  sendNotFound,
} from '../../../shared/helpers/responseHelper.js'
import { InvalidMemberNumberError } from '../../../shared/normalization/memberNumber.js'

/**
 * El unico lugar donde un error se convierte en respuesta HTTP.
 *
 * Los controllers NO tienen try/catch. Express 5 reenvia solo las promesas
 * rechazadas, asi que un `throw new AppError(404, ...)` adentro de un caso de
 * uso llega hasta aca sin que nadie lo pase de mano en mano. Un try/catch por
 * controller es donde se pierde un error de verdad atras de un 500 generico.
 *
 * La forma de la respuesta la arma `shared/helpers/responseHelper.ts`, la misma
 * que usan los controllers para el camino feliz: `{ success, message, details? }`.
 * Que el error y el exito salgan del mismo helper es lo que garantiza que el
 * frontend tenga UN solo formato que entender.
 */
export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  // Ya viene decidido: el caso de uso es el que sabe si "no existe" es 404 o
  // 409, y trae los mensajes en el idioma del operador.
  if (error instanceof AppError) {
    sendError(response, error.statusCode, error.message, error.details)
    return
  }

  // Validacion del borde: el cuerpo no tiene la forma esperada. Se devuelven
  // TODOS los campos que fallaron, no el primero: un formulario tiene que poder
  // marcar los tres a la vez.
  if (error instanceof ZodError) {
    sendBadRequest(
      response,
      ERROR_MESSAGES.GENERAL.VALIDATION_ERROR,
      error.issues.map(
        (issue) => `${issue.path.join('.') || '(cuerpo)'}: ${issue.message}`,
      ),
    )
    return
  }

  // Error de dato, no de programa: lo dispara una carga con un numero de
  // afiliado que no tiene ningun caracter util.
  if (error instanceof InvalidMemberNumberError) {
    sendBadRequest(response, ERROR_MESSAGES.GENERAL.INVALID_MEMBER_NUMBER)
    return
  }

  // Cualquier otra cosa es un bug nuestro. Se loguea entero para poder
  // arreglarlo y se contesta un mensaje generico: el stack de Node describe la
  // estructura interna del servidor y no tiene por que salir a la red.
  logger.error('Error no controlado', {
    method: request.method,
    path: request.path,
    error,
  })

  sendInternalError(response, ERROR_MESSAGES.GENERAL.INTERNAL_ERROR)
}

/**
 * Ruta inexistente. Va como ultimo middleware y no como `app.all('*')`: en
 * Express 5 los comodines del router cambiaron y un patron suelto es una
 * fuente de sorpresas.
 */
export function notFoundHandler(_request: Request, response: Response): void {
  sendNotFound(response, ERROR_MESSAGES.GENERAL.NOT_FOUND)
}
