import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { Role } from '../../../generated/prisma/enums.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { createAdminController } from '../controllers/adminController.js'
import { createAuthController } from '../controllers/authController.js'
import { createCareServiceController } from '../controllers/careServiceController.js'
import { createCatalogController } from '../controllers/catalogController.js'
import { createDashboardController } from '../controllers/dashboardController.js'
import { createEpisodeController } from '../controllers/episodeController.js'
import { createPatientController } from '../controllers/patientController.js'
import type { HttpDependencies } from '../dependencies.js'
import { createAuthenticate, requireRole } from '../middlewares/authenticate.js'
import { createMutationAudit } from '../middlewares/audit.js'

/**
 * El mapa completo de la API.
 *
 * Los permisos se leen ACA, en una sola pantalla, y no repartidos adentro de
 * cada controller. Es a proposito: "quien puede hacer que" es una pregunta que
 * alguien va a hacer, y tiene que poder contestarse leyendo un archivo en vez
 * de quince.
 *
 * Los tres roles de D14:
 *   ADMIN     administra catalogos y usuarios, y hace todo lo del operador
 *   OPERADOR  carga pacientes, episodios, prestaciones y autorizaciones
 *   LECTOR    mira. No escribe nada.
 */

/** Escribir requiere OPERADOR o ADMIN. LECTOR nunca. */
const CAN_WRITE = [Role.ADMIN, Role.OPERADOR] as const

/** Leer lo puede hacer cualquiera con sesion. */
const CAN_READ = [Role.ADMIN, Role.OPERADOR, Role.LECTOR] as const


export function createApiRouter(dependencies: HttpDependencies): Router {
  const router = Router()

  /**
   * Freno al login por fuerza bruta.
   *
   * Se construye por aplicacion y no a nivel de modulo: el contador vive en
   * memoria, y uno compartido haria que dos instancias de la app —dos tests,
   * dos procesos— se gasten los intentos entre si.
   *
   * Va SOLO en login y no en toda la API: un limite global castigaria a la
   * coordinacion entera un lunes a la manana por usar el sistema, que es
   * exactamente para lo que esta.
   */
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // El 429 lo contesta la libreria, no el `errorHandler`, asi que el envelope
    // se arma a mano aca. Es el unico lugar de la API donde eso pasa, y tiene
    // que seguir la misma forma: para el cliente, un 429 no es un caso especial.
    message: {
      success: false,
      message: ERROR_MESSAGES.AUTH.TOO_MANY_ATTEMPTS,
    },
  })

  // Lee el usuario en cada pedido: sin eso, una baja tarda hasta quince
  // minutos en surtir efecto sobre el access token ya emitido.
  const authenticate = createAuthenticate(
    dependencies.tokenService,
    dependencies.infrastructure.users,
  )

  const auth = createAuthController(dependencies)
  const patients = createPatientController(dependencies)
  const episodes = createEpisodeController(dependencies)
  const careServices = createCareServiceController(dependencies)
  const catalogs = createCatalogController(dependencies)
  const dashboard = createDashboardController(dependencies)
  const admin = createAdminController(dependencies)

  // --- Sesion -------------------------------------------------------------
  const authRouter = Router()
  authRouter.post('/login', loginLimiter, auth.login)
  authRouter.post('/refresh', auth.refresh)
  authRouter.post('/logout', auth.logout)
  authRouter.get('/me', authenticate, auth.me)
  router.use('/auth', authRouter)

  // De aca para abajo, todo pide sesion. Se declara UNA vez en vez de
  // recordarlo ruta por ruta: la ruta que se olvide del middleware no existe si
  // el middleware esta antes de todas.
  router.use(authenticate)
  router.use(createMutationAudit())

  // --- Dashboard ----------------------------------------------------------
  router.get('/dashboard', requireRole(...CAN_READ), dashboard.get)

  // --- Pacientes ----------------------------------------------------------
  const patientRouter = Router()
  patientRouter.get('/', requireRole(...CAN_READ), patients.search)
  patientRouter.post('/', requireRole(...CAN_WRITE), patients.create)
  patientRouter.get('/:id', requireRole(...CAN_READ), patients.detail)
  patientRouter.patch('/:id', requireRole(...CAN_WRITE), patients.update)
  // No es DELETE: no borra nada, y no se puede usar sobre un paciente con
  // episodios. La baja es solo para un paciente cargado por error.
  patientRouter.post('/:id/deactivate', requireRole(...CAN_WRITE), patients.remove)
  patientRouter.get(
    '/:id/readmission-draft',
    requireRole(...CAN_READ),
    patients.readmissionDraft,
  )
  patientRouter.post(
    '/:id/insurance-provider-change',
    requireRole(...CAN_WRITE),
    patients.changeInsuranceProvider,
  )
  router.use('/patients', patientRouter)

  // La busqueda previa al alta (D8). Cuelga de afiliaciones y no de pacientes
  // porque la pregunta es sobre una AFILIACION, que es lo que identifica.
  router.get('/affiliations/lookup', requireRole(...CAN_READ), patients.lookupAffiliation)

  // --- Episodios ----------------------------------------------------------
  const episodeRouter = Router()
  episodeRouter.post('/', requireRole(...CAN_WRITE), episodes.open)
  episodeRouter.post('/:id/close', requireRole(...CAN_WRITE), episodes.close)
  // La ficha del paciente trae los episodios; esto trae lo que pasa adentro.
  episodeRouter.get('/:id/care-services', requireRole(...CAN_READ), episodes.listCareServices)
  router.use('/episodes', episodeRouter)

  // --- Prestaciones y autorizaciones --------------------------------------
  const careServiceRouter = Router()
  careServiceRouter.post('/', requireRole(...CAN_WRITE), careServices.create)
  careServiceRouter.patch(
    '/:id/professional',
    requireRole(...CAN_WRITE),
    careServices.assignProfessional,
  )
  careServiceRouter.post('/:id/end', requireRole(...CAN_WRITE), careServices.end)
  careServiceRouter.get(
    '/:id/authorizations',
    requireRole(...CAN_READ),
    careServices.listAuthorizations,
  )
  careServiceRouter.post(
    '/:id/authorizations',
    requireRole(...CAN_WRITE),
    careServices.createAuthorization,
  )
  router.use('/care-services', careServiceRouter)

  // Reclamar es un hecho sobre la autorizacion, no sobre la prestacion.
  router.post(
    '/authorizations/:id/claim',
    requireRole(...CAN_WRITE),
    careServices.claimAuthorization,
  )

  // --- Catalogos ----------------------------------------------------------
  // Se LEEN con cualquier rol: son los selectores de las pantallas. La
  // administracion de catalogos es de ADMIN y todavia no tiene endpoints.
  const catalogRouter = Router()
  catalogRouter.get('/insurance-providers', catalogs.insuranceProviders)
  catalogRouter.get('/contracting-companies', catalogs.contractingCompanies)
  catalogRouter.get('/specialties', catalogs.specialties)
  catalogRouter.get('/frequencies', catalogs.frequencies)
  catalogRouter.get('/professionals', catalogs.professionals)
  catalogRouter.get('/provinces', catalogs.provinces)
  catalogRouter.get('/localities', catalogs.localities)
  router.use('/catalogs', requireRole(...CAN_READ), catalogRouter)

  // --- Administración (D14) -----------------------------------------------
  // Un solo `requireRole(ADMIN)` en el montaje, no repetido ruta por ruta:
  // la ruta que se olvide del guarda no existe si el guarda está antes de
  // todas. Y no hay ni un DELETE en todo el bloque: en IDUtils no se borra
  // catálogo, se desactiva (D11).
  const adminRouter = Router()

  adminRouter.get('/specialties', admin.listSpecialties)
  adminRouter.post('/specialties', admin.createSpecialty)
  adminRouter.patch('/specialties/:id', admin.updateSpecialty)
  adminRouter.post('/specialties/:id/deactivate', admin.deactivateSpecialty)
  adminRouter.put('/specialties/:id/frequencies', admin.setSpecialtyFrequencies)

  adminRouter.get('/frequencies', admin.listFrequencies)
  adminRouter.post('/frequencies', admin.createFrequency)
  adminRouter.post('/frequencies/:id/deactivate', admin.deactivateFrequency)

  adminRouter.get('/professionals', admin.listProfessionals)
  adminRouter.post('/professionals', admin.createProfessional)
  adminRouter.patch('/professionals/:id', admin.updateProfessional)
  adminRouter.put('/professionals/:id/specialties', admin.setProfessionalSpecialties)

  adminRouter.get('/contracting-companies', admin.listContractingCompanies)
  adminRouter.post('/contracting-companies', admin.createContractingCompany)
  adminRouter.put(
    '/contracting-companies/:id/insurance-providers',
    admin.setCompanyInsuranceProviders,
  )

  adminRouter.get('/insurance-providers', admin.listInsuranceProviders)
  adminRouter.post('/insurance-providers', admin.createInsuranceProvider)

  // El catalogo de provincias viene sembrado y se LEE desde `/catalogs`. Las
  // localidades no: las carga la coordinacion segun su zona (D12), y sin esta
  // ruta una instalacion real no puede dar de alta a ningun paciente.
  adminRouter.post('/localities', admin.createLocality)

  adminRouter.get('/users', admin.listUsers)
  adminRouter.post('/users', admin.createUser)
  adminRouter.post('/users/:id/password', admin.changeUserPassword)
  adminRouter.post('/users/:id/deactivate', admin.deactivateUser)

  router.use('/admin', requireRole(Role.ADMIN), adminRouter)

  return router
}
