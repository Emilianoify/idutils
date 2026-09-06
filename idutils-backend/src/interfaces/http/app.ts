import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import type { HttpDependencies } from './dependencies.js'
import { createAccessLogger } from './middlewares/accessLogger.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { createApiRouter } from './routes/index.js'

/**
 * La aplicacion HTTP, como funcion de sus dependencias.
 *
 * No abre conexiones, no lee variables de entorno y no escucha en ningun
 * puerto: eso es trabajo de `main.ts`. Por eso un test puede levantar la API
 * entera con repositorios en memoria y sin Postgres.
 *
 * Contrato de respuestas, uno solo para toda la API, y lo arma siempre
 * `shared/helpers/responseHelper.ts`:
 *   exito     -> `{ success: true,  message, data? }`
 *   error     -> `{ success: false, message, details? }`
 *   paginado  -> `{ success: true,  message, data: T[], meta }`
 *
 * `data` ES el dato, no una caja con el dato adentro. `details` trae TODAS las
 * violaciones y no la primera, para que un formulario pueda marcar los tres
 * campos juntos en vez de uno por intento.
 *
 * `GET /health` es la unica excepcion, y esta abajo con su motivo.
 */
export function createApp(dependencies: HttpDependencies): Express {
  const app = express()

  // Detras de un reverse proxy (el caso normal en Docker) la IP real viene en
  // X-Forwarded-For. Cuantos saltos confiar lo decide quien instala: confiar de
  // mas deja que cualquiera falsifique su IP y esquive el limite de login,
  // confiar de menos hace que todos compartan la IP del proxy.
  if (dependencies.trustProxyHops > 0) {
    app.set('trust proxy', dependencies.trustProxyHops)
  }

  app.disable('x-powered-by')
  app.use(helmet())

  // `credentials: true` y lista blanca de origenes. Con cookies de sesion,
  // `origin: '*'` directamente no funciona, y esta bien que no funcione.
  app.use(
    cors({
      origin: [...dependencies.allowedOrigins],
      credentials: true,
    }),
  )

  // 1 MB alcanza de sobra: el cuerpo mas grande de esta API es un alta de
  // episodio con sus prestaciones. Sin techo, un POST gigante es un ataque
  // gratis.
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  if (process.env.NODE_ENV !== 'test') {
    // Solo registra el pathname parseado: nunca la query, headers ni cuerpos.
    // `remote-addr` sigue leyendo la IP que Express resolvio con `trust proxy`.
    app.use(createAccessLogger())
  }

  /**
   * Para el HEALTHCHECK del contenedor. No toca la base a proposito: responde
   * si el proceso esta vivo, que es otra pregunta que si la base anda.
   *
   * Es la unica respuesta de todo el proceso que NO usa el envelope, y es
   * deliberado: su consumidor es `docker`, que mira el codigo de estado y no
   * parsea JSON. Meterla en el contrato de la API la haria parecer un endpoint
   * de la API, que es justo lo que no es —no cuelga de `/api` ni pide sesion.
   */
  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' })
  })

  app.use('/api', createApiRouter(dependencies))

  // El orden importa: primero la ruta inexistente, despues el manejador de
  // errores. Express identifica al de errores por sus cuatro parametros y tiene
  // que ser el ultimo `use` de todos.
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
