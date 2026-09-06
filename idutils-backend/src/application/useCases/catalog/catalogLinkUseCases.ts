import type {
  IContractingCompanyRepository,
  IFrequencyRepository,
  IInsuranceProviderRepository,
  IProfessionalRepository,
  ISpecialtyRepository,
} from '../../../domain/repositories/ICatalogRepository.js'
import { ERROR_MESSAGES } from '../../../shared/constants/messages.js'
import { AppError } from '../../../shared/errors/AppError.js'

/**
 * Las tres relaciones que un ADMIN administra.
 *
 * Las tres son "reemplazá el conjunto entero", no "agregá uno". Es a proposito:
 * una pantalla de administracion muestra checkboxes y guarda el estado final.
 * Con `agregar` y `quitar` sueltos, dos pestañas abiertas se pisan y el
 * resultado depende del orden en que apretaron guardar.
 *
 * Las tres validan que lo referenciado exista ANTES de escribir. Sin eso, un id
 * inventado sale como violacion de clave foranea traducida a "alguno de los
 * datos relacionados no existe", que es verdad pero no dice cual.
 */

/** Qué frecuencias se ofrecen al autorizar esta especialidad. ES el filtro de D11. */
export class SetSpecialtyFrequenciesUseCase {
  constructor(
    private readonly specialtyRepository: ISpecialtyRepository,
    private readonly frequencyRepository: IFrequencyRepository,
  ) {}

  async execute(specialtyId: string, frequencyIds: readonly string[]): Promise<void> {
    const specialty = await this.specialtyRepository.findById(specialtyId)
    if (specialty === null) throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)

    for (const frequencyId of frequencyIds) {
      const frequency = await this.frequencyRepository.findById(frequencyId)
      if (frequency === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.FREQUENCY_NOT_FOUND)
      }
    }

    const current = await this.frequencyRepository.listEligibleForSpecialty(specialty.id)
    const currentIds = new Set(current.map((frequency) => frequency.id))
    const wanted = new Set(frequencyIds)

    for (const frequencyId of wanted) {
      if (!currentIds.has(frequencyId)) {
        await this.frequencyRepository.linkToSpecialty(specialty.id, frequencyId)
      }
    }

    for (const frequencyId of currentIds) {
      if (!wanted.has(frequencyId)) {
        await this.frequencyRepository.unlinkFromSpecialty(specialty.id, frequencyId)
      }
    }
  }
}

/** Qué especialidades hace este profesional. Valida la asignación a una prestación (D13). */
export class SetProfessionalSpecialtiesUseCase {
  constructor(
    private readonly professionalRepository: IProfessionalRepository,
    private readonly specialtyRepository: ISpecialtyRepository,
  ) {}

  async execute(professionalId: string, specialtyIds: readonly string[]): Promise<void> {
    const professional = await this.professionalRepository.findById(professionalId)
    if (professional === null) {
      throw new AppError(404, ERROR_MESSAGES.CATALOG.PROFESSIONAL_NOT_FOUND)
    }

    for (const specialtyId of specialtyIds) {
      const specialty = await this.specialtyRepository.findById(specialtyId)
      if (specialty === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.SPECIALTY_NOT_FOUND)
      }
    }

    // El repositorio lo hace atomico: entre "borré las viejas" y "cargué las
    // nuevas", el profesional quedaría sin ninguna especialidad, y una
    // prestación creada en ese instante sería rechazada por una regla que en
    // realidad se cumple.
    await this.professionalRepository.setSpecialties(professional.id, specialtyIds)
  }
}

/**
 * Con qué obras sociales tiene convenio esta empresa (D2).
 *
 * Es la tabla que sostiene toda la cobertura DERIVADA: la coordinación no tiene
 * contrato con ninguna obra social, llega a ellas a través de las empresas.
 * Vaciar esta lista deja a esa empresa sin poder atender a nadie, y es una
 * decisión válida —se cayó el convenio— pero no un accidente: la pantalla
 * tiene que mostrarlo.
 */
export class SetCompanyInsuranceProvidersUseCase {
  constructor(
    private readonly contractingCompanyRepository: IContractingCompanyRepository,
    private readonly insuranceProviderRepository: IInsuranceProviderRepository,
  ) {}

  async execute(
    contractingCompanyId: string,
    insuranceProviderIds: readonly string[],
  ): Promise<void> {
    const company = await this.contractingCompanyRepository.findById(contractingCompanyId)
    if (company === null) throw new AppError(404, ERROR_MESSAGES.CATALOG.COMPANY_NOT_FOUND)

    for (const insuranceProviderId of insuranceProviderIds) {
      const provider = await this.insuranceProviderRepository.findById(insuranceProviderId)
      if (provider === null) {
        throw new AppError(404, ERROR_MESSAGES.CATALOG.INSURANCE_PROVIDER_NOT_FOUND)
      }
    }

    await this.contractingCompanyRepository.setInsuranceProviders(
      company.id,
      insuranceProviderIds,
    )
  }
}
