import type { Request, RequestHandler, Response } from 'express'
import { ChangeInsuranceProviderUseCase } from '../../../application/useCases/affiliation/changeInsuranceProviderUseCase.js'
import { BuildReadmissionDraftUseCase } from '../../../application/useCases/episode/buildReadmissionDraftUseCase.js'
import { CreatePatientUseCase } from '../../../application/useCases/patient/createPatientUseCase.js'
import { DeletePatientUseCase } from '../../../application/useCases/patient/deletePatientUseCase.js'
import { GetPatientDetailUseCase } from '../../../application/useCases/patient/getPatientDetailUseCase.js'
import { LookupAffiliationUseCase } from '../../../application/useCases/patient/lookupAffiliationUseCase.js'
import { SearchPatientsUseCase } from '../../../application/useCases/patient/searchPatientsUseCase.js'
import { UpdatePatientUseCase } from '../../../application/useCases/patient/updatePatientUseCase.js'
import { SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import {
  sendCreated,
  sendNoContent,
  sendOk,
  sendPaginated,
} from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'
import { definedOnly, idParamsSchema } from '../schemas/commonSchemas.js'
import {
  affiliationLookupSchema,
  changeInsuranceProviderSchema,
  createPatientSchema,
  patientSearchSchema,
  updatePatientSchema,
} from '../schemas/patientSchemas.js'

export function createPatientController(dependencies: HttpDependencies): {
  create: RequestHandler
  search: RequestHandler
  detail: RequestHandler
  update: RequestHandler
  remove: RequestHandler
  lookupAffiliation: RequestHandler
  changeInsuranceProvider: RequestHandler
  readmissionDraft: RequestHandler
} {
  const { infrastructure } = dependencies

  const createUseCase = new CreatePatientUseCase(
    infrastructure.unitOfWork,
    infrastructure.insuranceProviders,
    infrastructure.localities,
  )

  const searchUseCase = new SearchPatientsUseCase(
    infrastructure.patients,
    infrastructure.affiliations,
    infrastructure.episodes,
    infrastructure.insuranceProviders,
    infrastructure.clock,
  )

  const detailUseCase = new GetPatientDetailUseCase(
    infrastructure.patients,
    infrastructure.affiliations,
    infrastructure.episodes,
    infrastructure.insuranceProviders,
    infrastructure.clock,
  )

  const lookupUseCase = new LookupAffiliationUseCase(
    infrastructure.affiliations,
    infrastructure.patients,
    infrastructure.episodes,
    infrastructure.insuranceProviders,
    infrastructure.clock,
  )

  const changeProviderUseCase = new ChangeInsuranceProviderUseCase(
    infrastructure.unitOfWork,
    infrastructure.insuranceProviders,
  )

  const updateUseCase = new UpdatePatientUseCase(
    infrastructure.patients,
    infrastructure.localities,
  )

  const deleteUseCase = new DeletePatientUseCase(infrastructure.unitOfWork)

  const readmissionUseCase = new BuildReadmissionDraftUseCase(
    infrastructure.episodes,
    infrastructure.careServices,
    infrastructure.affiliations,
    infrastructure.specialties,
    infrastructure.contractingCompanies,
    infrastructure.professionals,
  )

  return {
    create: async (request: Request, response: Response): Promise<void> => {
      const command = createPatientSchema.parse(request.body)
      const patient = await createUseCase.execute(command)

      sendCreated(response, SUCCESS_MESSAGES.PATIENT.CREATED, patient)
    },

    search: async (request: Request, response: Response): Promise<void> => {
      const query = patientSearchSchema.parse(request.query)

      // Los filtros opcionales se OMITEN cuando no vienen, en vez de mandarse
      // como `undefined`: con `exactOptionalPropertyTypes`, "sin filtro de
      // texto" y "filtro de texto vacio" son dos cosas distintas, y el tipo
      // del puerto obliga a elegir cual es.
      const result = await searchUseCase.execute({
        limit: query.limit,
        offset: query.offset,
        ...(query.text !== undefined ? { text: query.text } : {}),
        ...(query.localityId !== undefined ? { localityId: query.localityId } : {}),
      })

      // El unico listado que pagina de verdad: los catalogos son selectores y
      // vienen enteros. `total` va en `meta` y no adentro de `data` porque no es
      // un paciente: es informacion sobre la ventana, no sobre el contenido.
      sendPaginated(response, SUCCESS_MESSAGES.PATIENT.LIST, result.items, {
        limit: query.limit,
        offset: query.offset,
        total: result.total,
      })
    },

    detail: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const patient = await detailUseCase.execute(id)

      sendOk(response, SUCCESS_MESSAGES.PATIENT.DETAIL, patient)
    },

    /**
     * Corregir, no cambiar de estado.
     *
     * Es PATCH y no PUT porque se manda solo lo que cambió: un PUT obligaría
     * al cliente a reenviar la ficha entera, y el campo que se olvide de
     * mandar se borra sin que nadie lo haya pedido.
     */
    update: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const changes = updatePatientSchema.parse(request.body)

      await updateUseCase.execute(id, definedOnly(changes))

      sendOk(response, SUCCESS_MESSAGES.PATIENT.UPDATED, await detailUseCase.execute(id))
    },

    /**
     * Baja de un paciente CARGADO POR ERROR.
     *
     * No es un DELETE de HTTP a propósito: no borra nada. Y no se puede usar
     * sobre un paciente con episodios, porque ahí lo que corresponde es
     * cerrar el episodio con su motivo, no hacer desaparecer a la persona.
     */
    remove: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)

      await deleteUseCase.execute(id)

      sendNoContent(response)
    },

    /**
     * El paso obligatorio de D8, antes de crear.
     *
     * `found: true` NO vincula nada: devuelve a quien pertenece esa afiliacion
     * para que el operador decida. Adivinar por nombre es exactamente como el
     * Excel termina con tres Juan Perez.
     */
    lookupAffiliation: async (request: Request, response: Response): Promise<void> => {
      const query = affiliationLookupSchema.parse(request.query)
      const result = await lookupUseCase.execute(query.insuranceProviderId, query.memberNumber)

      sendOk(response, SUCCESS_MESSAGES.PATIENT.AFFILIATION_LOOKUP, result)
    },

    /**
     * Cambio de obra social: cierra afiliacion, cierra episodio y abre la nueva,
     * todo en una transaccion (D8 + D9).
     *
     * Es un POST sobre el paciente y no un PUT de la afiliacion porque no es
     * una edicion: es un HECHO del negocio con tres consecuencias. Un PUT
     * invitaria a pensar que se puede "corregir" la obra social, y corregirla
     * es justamente lo que borra el historial.
     */
    changeInsuranceProvider: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const body = changeInsuranceProviderSchema.parse(request.body)

      const result = await changeProviderUseCase.execute({ patientId: id, ...body })

      sendOk(response, SUCCESS_MESSAGES.PATIENT.INSURANCE_PROVIDER_CHANGED, result)
    },

    /**
     * ES UN BORRADOR, NO UN HECHO: este endpoint no escribe nada.
     *
     * Por eso es GET. El operador saca, agrega o cambia, y recien al confirmar
     * llama a `POST /api/episodes`. Si copiara solo, algun dia habria
     * prestaciones que nadie miro.
     */
    readmissionDraft: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const draft = await readmissionUseCase.execute(id)

      sendOk(response, SUCCESS_MESSAGES.PATIENT.READMISSION_DRAFT, draft)
    },
  }
}
