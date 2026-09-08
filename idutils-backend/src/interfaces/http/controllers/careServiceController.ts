import type { Request, RequestHandler, Response } from 'express'
import { ClaimAuthorizationUseCase } from '../../../application/useCases/authorization/claimAuthorizationUseCase.js'
import { CreateAuthorizationUseCase } from '../../../application/useCases/authorization/createAuthorizationUseCase.js'
import { GetCareServiceTimelineUseCase } from '../../../application/useCases/authorization/getCareServiceTimelineUseCase.js'
import { CreateCareServiceUseCase } from '../../../application/useCases/careService/createCareServiceUseCase.js'
import { AssignCareServiceProfessionalUseCase } from '../../../application/useCases/careService/assignCareServiceProfessionalUseCase.js'
import { EndCareServiceUseCase } from '../../../application/useCases/careService/endCareServiceUseCase.js'
import { SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { sendCreated, sendOk } from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'
import {
  assignProfessionalSchema,
  createAuthorizationSchema,
  createCareServiceSchema,
  endCareServiceSchema,
} from '../schemas/careServiceSchemas.js'
import { idParamsSchema } from '../schemas/commonSchemas.js'

export function createCareServiceController(dependencies: HttpDependencies): {
  create: RequestHandler
  assignProfessional: RequestHandler
  end: RequestHandler
  listAuthorizations: RequestHandler
  createAuthorization: RequestHandler
  claimAuthorization: RequestHandler
} {
  const { infrastructure } = dependencies

  const createUseCase = new CreateCareServiceUseCase(
    infrastructure.careServices,
    infrastructure.episodes,
    infrastructure.affiliations,
    infrastructure.specialties,
    infrastructure.contractingCompanies,
    infrastructure.professionals,
  )
  const assignProfessionalUseCase = new AssignCareServiceProfessionalUseCase(
    infrastructure.careServices,
    infrastructure.episodes,
    infrastructure.professionals,
  )
  const endUseCase = new EndCareServiceUseCase(
    infrastructure.careServices,
    infrastructure.episodes,
  )

  const createAuthorizationUseCase = new CreateAuthorizationUseCase(
    infrastructure.authorizations,
    infrastructure.careServices,
    infrastructure.frequencies,
  )

  const claimUseCase = new ClaimAuthorizationUseCase(
    infrastructure.authorizations,
    infrastructure.clock,
  )

  const timelineUseCase = new GetCareServiceTimelineUseCase(
    infrastructure.careServices,
    infrastructure.episodes,
    infrastructure.authorizations,
    infrastructure.specialties,
    infrastructure.professionals,
    infrastructure.contractingCompanies,
    infrastructure.clock,
  )

  return {
    create: async (request: Request, response: Response): Promise<void> => {
      const command = createCareServiceSchema.parse(request.body)
      const result = await createUseCase.execute(command)

      sendCreated(response, SUCCESS_MESSAGES.CARE_SERVICE.CREATED, result)
    },

    /** `professionalId: null` la deja sin asignar. La prestacion existe igual. */
    assignProfessional: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { professionalId } = assignProfessionalSchema.parse(request.body)

      const updated = await assignProfessionalUseCase.execute(id, professionalId)

      sendOk(response, SUCCESS_MESSAGES.CARE_SERVICE.PROFESSIONAL_ASSIGNED, updated)
    },

    /** Baja individual: el episodio sigue abierto y las demas prestaciones corren. */
    end: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { endedOn } = endCareServiceSchema.parse(request.body)

      const updated = await endUseCase.execute(id, endedOn)

      sendOk(response, SUCCESS_MESSAGES.CARE_SERVICE.ENDED, updated)
    },

    /**
     * La linea de tiempo de la prestacion, mas nueva primero.
     *
     * Para una auditoria no hay que construirla: es esta lista. Y contesta
     * cuantas veces hubo que reclamar, que es el dato con el que se pelea un
     * contrato (D10).
     */
    listAuthorizations: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)

      sendOk(response, SUCCESS_MESSAGES.AUTHORIZATION.LIST, await timelineUseCase.execute(id))
    },

    /**
     * Renovar es AGREGAR una fila, no editar la anterior.
     *
     * Por eso es un POST a la coleccion y no existe ningun PUT: la prestacion
     * vive y las autorizaciones se suceden abajo.
     */
    createAuthorization: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const body = createAuthorizationSchema.parse(request.body)

      const result = await createAuthorizationUseCase.execute({ careServiceId: id, ...body })

      sendCreated(response, SUCCESS_MESSAGES.AUTHORIZATION.CREATED, result)
    },

    /**
     * Reclamar NO es autorizar.
     *
     * Deja constancia de que se pidio la renovacion. La prestacion sale de la
     * lista de reclamos pendientes pero sigue POR_VENCER, porque sigue
     * venciendo: nadie autorizo nada todavia.
     */
    claimAuthorization: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const result = await claimUseCase.execute(id)

      sendOk(response, SUCCESS_MESSAGES.AUTHORIZATION.CLAIMED, result)
    },
  }
}
