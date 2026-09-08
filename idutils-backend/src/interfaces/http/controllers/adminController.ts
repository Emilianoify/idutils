import type { Request, RequestHandler, Response } from 'express'
import {
  SetCompanyInsuranceProvidersUseCase,
  SetProfessionalSpecialtiesUseCase,
  SetSpecialtyFrequenciesUseCase,
} from '../../../application/useCases/catalog/catalogLinkUseCases.js'
import { ChangeUserPasswordUseCase } from '../../../application/useCases/user/changeUserPasswordUseCase.js'
import { CreateUserUseCase } from '../../../application/useCases/user/createUserUseCase.js'
import { DeactivateUserUseCase } from '../../../application/useCases/user/deactivateUserUseCase.js'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'
import {
  sendCreated,
  sendNoContent,
  sendOk,
} from '../../../shared/helpers/responseHelper.js'
import type { HttpDependencies } from '../dependencies.js'
import { currentUserId } from '../middlewares/authenticate.js'
import {
  changeUserPasswordSchema,
  createContractingCompanySchema,
  createFrequencySchema,
  createInsuranceProviderSchema,
  createLocalitySchema,
  createProfessionalSchema,
  createSpecialtySchema,
  createUserSchema,
  setCompanyInsuranceProvidersSchema,
  setProfessionalSpecialtiesSchema,
  setSpecialtyFrequenciesSchema,
  updateProfessionalSchema,
  updateSpecialtySchema,
} from '../schemas/adminSchemas.js'
import { definedOnly, idParamsSchema } from '../schemas/commonSchemas.js'

/**
 * Administración de catálogos y usuarios. Solo ADMIN (D14).
 *
 * Convención de esta capa, para que no se lea como un descuido: un endpoint que
 * NO tiene regla —listar, crear un nombre, desactivar— llama al repositorio
 * directamente. Uno que sí la tiene pasa por un caso de uso. Envolver un
 * `create` de una sola línea en una clase no agrega una regla; agrega un
 * archivo que hay que abrir para descubrir que no hace nada.
 *
 * Las reglas que sí existen y por eso tienen caso de uso: no dejar el sistema
 * sin ADMIN activo, hashear contraseñas, y validar que lo referenciado exista
 * antes de reescribir un conjunto de relaciones.
 *
 * Las desactivaciones contestan 204 y no el registro desactivado: el ADMIN ya
 * sabe qué acaba de tocar, y devolverlo invitaría a que la pantalla lo pintara
 * como si siguiera en el catálogo.
 */
export function createAdminController(dependencies: HttpDependencies): {
  listSpecialties: RequestHandler
  createSpecialty: RequestHandler
  updateSpecialty: RequestHandler
  deactivateSpecialty: RequestHandler
  setSpecialtyFrequencies: RequestHandler
  listFrequencies: RequestHandler
  createFrequency: RequestHandler
  deactivateFrequency: RequestHandler
  listProfessionals: RequestHandler
  createProfessional: RequestHandler
  updateProfessional: RequestHandler
  setProfessionalSpecialties: RequestHandler
  listContractingCompanies: RequestHandler
  createContractingCompany: RequestHandler
  setCompanyInsuranceProviders: RequestHandler
  listInsuranceProviders: RequestHandler
  createInsuranceProvider: RequestHandler
  createLocality: RequestHandler
  listUsers: RequestHandler
  createUser: RequestHandler
  changeUserPassword: RequestHandler
  deactivateUser: RequestHandler
} {
  const { infrastructure, passwordHasher } = dependencies

  const setSpecialtyFrequenciesUseCase = new SetSpecialtyFrequenciesUseCase(
    infrastructure.specialties,
    infrastructure.frequencies,
  )
  const setProfessionalSpecialtiesUseCase = new SetProfessionalSpecialtiesUseCase(
    infrastructure.professionals,
    infrastructure.specialties,
  )
  const setCompanyProvidersUseCase = new SetCompanyInsuranceProvidersUseCase(
    infrastructure.contractingCompanies,
    infrastructure.insuranceProviders,
  )
  const createUserUseCase = new CreateUserUseCase(infrastructure.users, passwordHasher)
  const changePasswordUseCase = new ChangeUserPasswordUseCase(
    infrastructure.users,
    passwordHasher,
  )
  const deactivateUserUseCase = new DeactivateUserUseCase(infrastructure.users)

  return {
    // --- Especialidades ---------------------------------------------------
    listSpecialties: async (_request: Request, response: Response): Promise<void> => {
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.SPECIALTIES,
        await infrastructure.specialties.listActive(),
      )
    },

    createSpecialty: async (request: Request, response: Response): Promise<void> => {
      const body = createSpecialtySchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.SPECIALTY_CREATED,
        await infrastructure.specialties.create(body),
      )
    },

    updateSpecialty: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const changes = updateSpecialtySchema.parse(request.body)

      const specialty = await infrastructure.specialties.findById(id)
      if (specialty === null) throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)

      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.SPECIALTY_UPDATED,
        await infrastructure.specialties.update(id, definedOnly(changes)),
      )
    },

    /**
     * Desactivar, nunca borrar (D11).
     *
     * Hay prestaciones apuntando a esta especialidad. Un DELETE se llevaría
     * puesta la historia con la que se defiende una auditoría; desactivarla
     * sólo la saca de los selectores, que es lo que el ADMIN quiso decir.
     */
    deactivateSpecialty: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)

      const specialty = await infrastructure.specialties.findById(id)
      if (specialty === null) throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)
      if (!specialty.active) {
        throw new AppError(409, ERROR_MESSAGES.CATALOG.ALREADY_INACTIVE)
      }

      await infrastructure.specialties.deactivate(id)
      sendNoContent(response)
    },

    setSpecialtyFrequencies: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { frequencyIds } = setSpecialtyFrequenciesSchema.parse(request.body)

      await setSpecialtyFrequenciesUseCase.execute(id, frequencyIds)

      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.SPECIALTY_FREQUENCIES_SET,
        await infrastructure.frequencies.listEligibleForSpecialty(id),
      )
    },

    // --- Frecuencias ------------------------------------------------------
    listFrequencies: async (_request: Request, response: Response): Promise<void> => {
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.FREQUENCIES,
        await infrastructure.frequencies.listActive(),
      )
    },

    createFrequency: async (request: Request, response: Response): Promise<void> => {
      const body = createFrequencySchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.FREQUENCY_CREATED,
        await infrastructure.frequencies.create(body),
      )
    },

    /**
     * No existe un PUT de frecuencia, y no es un olvido.
     *
     * Editar `2 semanales` para que diga `3 semanales` reescribiría lo que se
     * autorizó el mes pasado, porque las autorizaciones guardan la frecuencia
     * congelada pero también apuntan al catálogo. Editar es: crear la nueva,
     * engancharla donde corresponda y desactivar la vieja.
     */
    deactivateFrequency: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)

      const frequency = await infrastructure.frequencies.findById(id)
      if (frequency === null) throw new AppError(404, ERROR_MESSAGES.CATALOG.FREQUENCY_NOT_FOUND)
      if (!frequency.active) {
        throw new AppError(409, ERROR_MESSAGES.CATALOG.ALREADY_INACTIVE)
      }

      await infrastructure.frequencies.deactivate(id)
      sendNoContent(response)
    },

    // --- Profesionales ----------------------------------------------------
    listProfessionals: async (_request: Request, response: Response): Promise<void> => {
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.PROFESSIONALS,
        await infrastructure.professionals.listActive(),
      )
    },

    createProfessional: async (request: Request, response: Response): Promise<void> => {
      const body = createProfessionalSchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.PROFESSIONAL_CREATED,
        await infrastructure.professionals.create(body),
      )
    },

    updateProfessional: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const changes = updateProfessionalSchema.parse(request.body)

      const professional = await infrastructure.professionals.findById(id)
      if (professional === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.PROFESSIONAL_NOT_FOUND)
      }

      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.PROFESSIONAL_UPDATED,
        await infrastructure.professionals.update(id, definedOnly(changes)),
      )
    },

    setProfessionalSpecialties: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { specialtyIds } = setProfessionalSpecialtiesSchema.parse(request.body)

      await setProfessionalSpecialtiesUseCase.execute(id, specialtyIds)

      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.PROFESSIONAL_SPECIALTIES_SET,
        await infrastructure.professionals.listSpecialtyIds(id),
      )
    },

    // --- Empresas y obras sociales ----------------------------------------
    listContractingCompanies: async (_request: Request, response: Response): Promise<void> => {
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.CONTRACTING_COMPANIES,
        await infrastructure.contractingCompanies.listActive(),
      )
    },

    createContractingCompany: async (request: Request, response: Response): Promise<void> => {
      const body = createContractingCompanySchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.CONTRACTING_COMPANY_CREATED,
        await infrastructure.contractingCompanies.create(body),
      )
    },

    setCompanyInsuranceProviders: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { insuranceProviderIds } = setCompanyInsuranceProvidersSchema.parse(request.body)

      await setCompanyProvidersUseCase.execute(id, insuranceProviderIds)

      // Se devuelve el convenio resultante y no un OK: esta lista es lo que
      // decide a qué obras sociales llega la coordinación (D2), y el ADMIN
      // tiene que ver el efecto de lo que acaba de guardar.
      //
      // La lectura vive en el repositorio de prestaciones y no en el de
      // empresas porque es la misma consulta que alimenta la validación de
      // convenio al crear una prestación. Duplicarla sería tener dos verdades
      // sobre lo mismo.
      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.COMPANY_PROVIDERS_SET,
        await infrastructure.careServices.listInsuranceProviderIdsForCompany(id),
      )
    },

    /**
     * TODAS las obras sociales, no sólo las alcanzables.
     *
     * Es la diferencia con `/api/catalogs/insurance-providers`, que devuelve
     * las que tienen convenio con alguna empresa activa. El ADMIN necesita ver
     * también las que todavía no tienen convenio: si no, no podría cargar el
     * convenio que falta.
     */
    listInsuranceProviders: async (_request: Request, response: Response): Promise<void> => {
      sendOk(
        response,
        SUCCESS_MESSAGES.CATALOG.INSURANCE_PROVIDERS,
        await infrastructure.insuranceProviders.listActive(),
      )
    },

    createInsuranceProvider: async (request: Request, response: Response): Promise<void> => {
      const body = createInsuranceProviderSchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.INSURANCE_PROVIDER_CREATED,
        await infrastructure.insuranceProviders.create(body),
      )
    },

    // --- Localidades ------------------------------------------------------
    /**
     * Sin esto, una instalación real no puede dar de alta a nadie.
     *
     * El seed carga las 24 provincias y ninguna localidad —cada coordinación
     * atiende su zona (D12)— pero `POST /api/patients` exige `localityId`. Con
     * `SEED_DEMO` no se nota, porque la demo crea una; en la instalación de una
     * coordinación de verdad el selector de domicilio llega vacío y el alta no
     * tiene salida.
     *
     * La provincia se busca antes para poder contestar 404 con el motivo. La FK
     * también la protege, pero su mensaje es genérico: "alguno de los datos
     * relacionados no existe" no le dice al operador cuál.
     */
    createLocality: async (request: Request, response: Response): Promise<void> => {
      const body = createLocalitySchema.parse(request.body)

      const province = await infrastructure.localities.findProvinceById(body.provinceId)
      if (province === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.PROVINCE_NOT_FOUND)
      }

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.LOCALITY_CREATED,
        await infrastructure.localities.create(body),
      )
    },

    // --- Usuarios ---------------------------------------------------------
    listUsers: async (_request: Request, response: Response): Promise<void> => {
      const users = await infrastructure.users.listActive()

      // Se arma la vista campo por campo. Devolver la entidad entera sacaría
      // `passwordHash` por la red, y ningún control posterior lo recupera.
      sendOk(
        response,
        SUCCESS_MESSAGES.ADMIN.USERS,
        users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        })),
      )
    },

    createUser: async (request: Request, response: Response): Promise<void> => {
      const body = createUserSchema.parse(request.body)

      sendCreated(
        response,
        SUCCESS_MESSAGES.ADMIN.USER_CREATED,
        await createUserUseCase.execute(body),
      )
    },

    /**
     * Cambiar la contraseña cierra TODAS las sesiones de ese usuario.
     *
     * El repositorio sube `tokenVersion` en la misma operación. Es la única
     * forma que tiene el sistema de echar a alguien de todos sus dispositivos,
     * y es exactamente lo que uno quiere cuando cambia una contraseña.
     */
    changeUserPassword: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)
      const { password } = changeUserPasswordSchema.parse(request.body)

      await changePasswordUseCase.execute(id, password)
      sendNoContent(response)
    },

    deactivateUser: async (request: Request, response: Response): Promise<void> => {
      const { id } = idParamsSchema.parse(request.params)

      // Quién lo pide sale del token, no del cuerpo: si viniera de afuera,
      // cualquiera podría decir que es otro y esquivar la regla de "no podés
      // darte de baja a vos mismo".
      await deactivateUserUseCase.execute(id, currentUserId(request))
      sendNoContent(response)
    },
  }
}
