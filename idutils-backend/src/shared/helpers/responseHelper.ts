import type { Response } from 'express'

/**
 * El unico lugar donde se arma una respuesta HTTP con exito.
 *
 * Existe por una razon concreta, y es la que estaba rota antes: cada controller
 * envolvia el dato a su gusto. `GET /api/patients/:id` contestaba
 * `{ patient: {...} }`, `GET /api/patients` contestaba `{ items, total }` pelado
 * y `POST /api/auth/logout` un `{ message }` con el texto escrito ahi mismo. Tres
 * formas para lo mismo obligan al frontend a tener un `if` por endpoint para
 * saber donde esta el dato, y cada endpoint nuevo es otro `if`.
 *
 * Ahora hay una sola forma, en los dos sentidos:
 *
 *   exito     { success: true,  message, data? }
 *   error     { success: false, message, details? }
 *   paginado  { success: true,  message, data: T[], meta }
 *
 * `data` ES el dato, no una caja con el dato adentro: `data` es el paciente, no
 * `{ patient }`. Volver a envolverlo seria conservar el problema con un nombre
 * mas prolijo.
 *
 * Los errores los arma `interfaces/http/middlewares/errorHandler.ts`, que usa
 * estos mismos helpers. Un controller nunca llama a `sendBadRequest` y compania
 * a mano: tira `AppError` y el manejador traduce.
 *
 * Unica excepcion en toda la API: `GET /health`, que contesta `{ status: 'ok' }`
 * porque su consumidor es el HEALTHCHECK del contenedor y no un cliente de la
 * API.
 */

/**
 * Paginacion por ventana, no por pagina.
 *
 * Es `offset` y no `page` porque es lo que los repositorios reciben y lo que la
 * base ejecuta. Traducir a numero de pagina en el borde seria inventar un
 * concepto que ninguna capa de abajo usa, y que se desincroniza el dia que un
 * listado cambie de tamano de ventana.
 */
export interface PaginationMeta {
  limit: number
  offset: number
  total: number
}

interface SuccessBody {
  success: true
  message: string
  data?: unknown
}

interface ErrorBody {
  success: false
  message: string
  details?: readonly string[]
}

/**
 * `data` se omite cuando no hay dato, en vez de mandarse en `null`.
 *
 * Con `exactOptionalPropertyTypes` un `data?: unknown` no acepta
 * `{ data: undefined }`, y ademas es lo correcto para el cliente: la clave
 * ausente y la clave en `null` son dos cosas distintas, y solo una de las dos
 * significa "este endpoint no devuelve nada".
 */
function success(
  res: Response,
  status: number,
  message: string,
  data?: unknown,
): void {
  const body: SuccessBody =
    data === undefined ? { success: true, message } : { success: true, message, data }

  res.status(status).json(body)
}

function failure(
  res: Response,
  status: number,
  message: string,
  details?: readonly string[],
): void {
  const body: ErrorBody =
    details === undefined
      ? { success: false, message }
      : { success: false, message, details }

  res.status(status).json(body)
}

// --- Exito ------------------------------------------------------------------

export const sendOk = (res: Response, message: string, data?: unknown): void =>
  success(res, 200, message, data)

export const sendCreated = (res: Response, message: string, data?: unknown): void =>
  success(res, 201, message, data)

/**
 * Sin cuerpo, y por lo tanto sin envelope: un 204 con JSON adentro es una
 * contradiccion que algunos clientes rechazan.
 */
export const sendNoContent = (res: Response): void => {
  res.status(204).send()
}

export const sendPaginated = (
  res: Response,
  message: string,
  items: readonly unknown[],
  meta: PaginationMeta,
): void => {
  res.status(200).json({ success: true, message, data: items, meta })
}

// --- Error ------------------------------------------------------------------
//
// `details` lleva TODAS las violaciones y no la primera, para que un formulario
// pueda marcar los tres campos juntos en vez de uno por intento.

export const sendBadRequest = (
  res: Response,
  message: string,
  details?: readonly string[],
): void => failure(res, 400, message, details)

export const sendUnauthorized = (res: Response, message: string): void =>
  failure(res, 401, message)

export const sendForbidden = (res: Response, message: string): void =>
  failure(res, 403, message)

export const sendNotFound = (res: Response, message: string): void =>
  failure(res, 404, message)

export const sendConflict = (
  res: Response,
  message: string,
  details?: readonly string[],
): void => failure(res, 409, message, details)

export const sendInternalError = (res: Response, message: string): void =>
  failure(res, 500, message)

/**
 * Para un `AppError` que ya trae su propio codigo decidido por el caso de uso.
 *
 * El caso de uso es el que sabe si "no existe" es 404 o 409; el borde no lo
 * vuelve a decidir. Se usa solo desde el `errorHandler`.
 */
export const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: readonly string[],
): void => failure(res, status, message, details)
