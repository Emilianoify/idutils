import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import type { ProfessionalSelectorDto } from '../../../application/dto/catalogDto.js'
import type { Professional } from '../../../domain/entities/professionalEntity.js'
import { formatFrequency } from '../../../domain/services/frequencyLabel.js'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import { sendOk } from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'
import { idSchema } from '../schemas/commonSchemas.js'

const bySpecialtySchema = z.object({ specialtyId: idSchema })
const optionalSpecialtySchema = z.object({ specialtyId: idSchema.optional() })
const optionalProviderSchema = z.object({ insuranceProviderId: idSchema.optional() })

const localitySearchSchema = z.object({
  provinceId: idSchema.optional(),
  text: z.string().min(2).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

function toProfessionalSelectorDto(professional: Professional): ProfessionalSelectorDto {
  return {
    id: professional.id,
    lastName: professional.lastName,
    firstName: professional.firstName,
    licenseNumber: professional.licenseNumber,
  }
}

/**
 * Los catalogos que alimentan los selectores del alta.
 *
 * Cada endpoint devuelve LO QUE SE PUEDE ELEGIR, no el catalogo entero. Es la
 * diferencia entre un selector que guia y uno que deja cargar un dato que
 * despues rebota contra una regla tres pantallas mas adelante.
 *
 * Ninguno pagina: son listas de selector, acotadas por definicion. Por eso van
 * con `sendOk` y no con `sendPaginated` — un `meta` con el total de una lista
 * que siempre viene entera no informa nada.
 */
export function createCatalogController(dependencies: HttpDependencies): {
  insuranceProviders: RequestHandler
  contractingCompanies: RequestHandler
  specialties: RequestHandler
  frequencies: RequestHandler
  professionals: RequestHandler
  provinces: RequestHandler
  localities: RequestHandler
} {
  const { infrastructure } = dependencies

  return {
    /**
     * Solo las obras sociales ALCANZABLES (D2).
     *
     * La coordinacion no tiene contrato con ninguna obra social: llega a ellas
     * a traves de las empresas. Un selector con el catalogo completo deja
     * cargar un paciente que despues no se le puede facturar a nadie.
     */
    insuranceProviders: async (_request: Request, response: Response): Promise<void> => {
      const items = await infrastructure.insuranceProviders.listReachable()
      sendOk(response, SUCCESS_MESSAGES.CATALOG.INSURANCE_PROVIDERS, items)
    },

    contractingCompanies: async (request: Request, response: Response): Promise<void> => {
      const { insuranceProviderId } = optionalProviderSchema.parse(request.query)

      const items =
        insuranceProviderId === undefined
          ? await infrastructure.contractingCompanies.listActive()
          : await infrastructure.contractingCompanies.listActiveByInsuranceProvider(
              insuranceProviderId,
            )

      sendOk(response, SUCCESS_MESSAGES.CATALOG.CONTRACTING_COMPANIES, items)
    },

    specialties: async (_request: Request, response: Response): Promise<void> => {
      const items = await infrastructure.specialties.listActive()
      sendOk(response, SUCCESS_MESSAGES.CATALOG.SPECIALTIES, items)
    },

    /**
     * `specialtyId` es OBLIGATORIO, y no es una molestia de la API.
     *
     * Asignar Medico Clinico no ofrece 100 frecuencias: ofrece las que estan
     * relacionadas con clinico (D11). Si este endpoint devolviera todas cuando
     * falta el parametro, el filtro pasaria a ser responsabilidad del
     * frontend, o sea de nadie.
     */
    frequencies: async (request: Request, response: Response): Promise<void> => {
      const { specialtyId } = bySpecialtySchema.parse(request.query)

      const specialty = await infrastructure.specialties.findById(specialtyId)
      if (specialty === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)
      }

      const items = await infrastructure.frequencies.listEligibleForSpecialty(specialtyId)

      // La etiqueta se arma ACA y no en el cliente, aunque el cliente tenga los
      // dos datos. `2 semanales` es una sola fila del catalogo y el sustantivo
      // lo pone la especialidad (D11): si el frontend lo resolviera, esa regla
      // viviria en dos lugares y el dia que se agregue una unidad nueva van a
      // quedar diciendo cosas distintas.
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.FREQUENCIES,
        items.map((frequency) => ({
          ...frequency,
          label: formatFrequency(frequency, specialty.serviceUnit),
        })),
      )
    },

    professionals: async (request: Request, response: Response): Promise<void> => {
      const { specialtyId } = optionalSpecialtySchema.parse(request.query)

      const items =
        specialtyId === undefined
          ? await infrastructure.professionals.listActive()
          : await infrastructure.professionals.listActiveBySpecialty(specialtyId)

      // El selector recibe una proyeccion explicita. La entidad conserva los
      // datos de pago para los casos que realmente los necesiten, pero este
      // borde HTTP no los serializa para ningun rol.
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.PROFESSIONALS,
        items.map(toProfessionalSelectorDto),
      )
    },

    provinces: async (_request: Request, response: Response): Promise<void> => {
      const items = await infrastructure.localities.listProvinces()
      sendOk(response, SUCCESS_MESSAGES.CATALOG.PROVINCES, items)
    },

    localities: async (request: Request, response: Response): Promise<void> => {
      const { provinceId, text, limit } = localitySearchSchema.parse(request.query)

      const items =
        text !== undefined
          ? await infrastructure.localities.search(text, limit)
          : provinceId !== undefined
            ? await infrastructure.localities.listByProvince(provinceId)
            : []

      sendOk(response, SUCCESS_MESSAGES.CATALOG.LOCALITIES, items)
    },
  }
}
