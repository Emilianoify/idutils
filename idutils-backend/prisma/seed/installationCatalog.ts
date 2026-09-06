import type { PrismaClient } from '../../src/generated/prisma/client.js'
import type { FrequencyUnit, ServiceUnit } from '../../src/generated/prisma/enums.js'

/**
 * El catalogo base de una instalacion nueva.
 *
 * LA REGLA QUE MANDA ACA: se siembra UNA VEZ, en la instalacion, y no se
 * reaplica nunca. Si se reaplicara, resucitaria las frecuencias y
 * especialidades que la coordinacion dio de baja a proposito, y volverian a
 * aparecer en los selectores sin que nadie las haya vuelto a pedir.
 *
 * Por eso cada catalogo se saltea entero si YA TIENE alguna fila. No se
 * completa fila por fila: una fila ausente no significa "falta", significa "la
 * coordinacion no la quiere". Distinguir esas dos cosas es imposible desde
 * aca, y ante la duda no se toca.
 *
 * Las especialidades y sus frecuencias son un PUNTO DE PARTIDA, no doctrina:
 * cada coordinacion las ajusta desde la administracion. Estan aca para que el
 * dia uno se pueda cargar un paciente, no para decirle a nadie como trabajar.
 */

interface FrequencySeed {
  amount: number
  unit: FrequencyUnit
}

interface SpecialtySeed {
  name: string
  serviceUnit: ServiceUnit
  /** Las que se ofrecen al autorizar esta especialidad. ES el filtro de D11. */
  frequencies: FrequencySeed[]
}

const weekly = (amount: number): FrequencySeed => ({ amount, unit: 'SEMANAL' })
const monthly = (amount: number): FrequencySeed => ({ amount, unit: 'MENSUAL' })

/** Matematica pura, sin sustantivo: `2 semanales` es UNA fila (D11). */
const FREQUENCIES: FrequencySeed[] = [
  weekly(1),
  weekly(2),
  weekly(3),
  weekly(4),
  weekly(5),
  weekly(6),
  weekly(7),
  monthly(1),
  monthly(2),
  monthly(3),
  monthly(4),
]

/**
 * Cada especialidad ofrece un SUBCONJUNTO de las frecuencias, no todas.
 *
 * Es el punto entero de D11: asignar Medicina Clinica no ofrece once opciones,
 * ofrece las que tienen sentido para clinica. Si todas se relacionaran con
 * todas, la tabla de union no filtraria nada y el selector volveria a ser una
 * lista larga que el operador recorre a ojo.
 */
const SPECIALTIES: SpecialtySeed[] = [
  {
    name: 'Medicina Clínica',
    serviceUnit: 'VISITA',
    frequencies: [monthly(1), monthly(2), monthly(4), weekly(1), weekly(2)],
  },
  {
    name: 'Enfermería',
    serviceUnit: 'VISITA',
    frequencies: [weekly(1), weekly(2), weekly(3), weekly(5), weekly(7)],
  },
  {
    name: 'Kinesiología Motora',
    serviceUnit: 'SESION',
    frequencies: [weekly(1), weekly(2), weekly(3), weekly(4), weekly(5)],
  },
  {
    name: 'Kinesiología Respiratoria',
    serviceUnit: 'SESION',
    frequencies: [weekly(2), weekly(3), weekly(5), weekly(7)],
  },
  {
    name: 'Fonoaudiología',
    serviceUnit: 'SESION',
    frequencies: [weekly(1), weekly(2), weekly(3)],
  },
  {
    name: 'Terapia Ocupacional',
    serviceUnit: 'SESION',
    frequencies: [weekly(1), weekly(2), weekly(3)],
  },
  {
    name: 'Nutrición',
    serviceUnit: 'VISITA',
    frequencies: [monthly(1), monthly(2), weekly(1)],
  },
  {
    name: 'Psicología',
    serviceUnit: 'SESION',
    frequencies: [weekly(1), weekly(2)],
  },
  {
    name: 'Cuidador Domiciliario',
    serviceUnit: 'HORA',
    frequencies: [weekly(3), weekly(5), weekly(6), weekly(7)],
  },
]

/** Las 24 jurisdicciones. Dato canonico, no una opinion. */
const PROVINCES: string[] = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  'Tucumán',
]

export interface SeedReport {
  frequencies: number
  specialties: number
  specialtyFrequencyLinks: number
  provinces: number
  skipped: string[]
}

/**
 * Siembra el catalogo base. Es seguro correrlo mil veces: a partir de la
 * segunda no hace nada.
 *
 * Devuelve un reporte en vez de loguear adentro para que el que llama decida
 * como contarlo —por consola en la instalacion, con asserts en un test—.
 */
export async function seedInstallationCatalog(client: PrismaClient): Promise<SeedReport> {
  const report: SeedReport = {
    frequencies: 0,
    specialties: 0,
    specialtyFrequencyLinks: 0,
    provinces: 0,
    skipped: [],
  }

  // --- Frecuencias --------------------------------------------------------
  // `count` sin filtro de `deletedAt`: una frecuencia dada de baja SIGUE
  // contando como "este catalogo ya se sembro". Filtrarla haria que el
  // siguiente seed la resucite, que es exactamente lo que hay que evitar.
  if ((await client.frequency.count()) === 0) {
    const created = await client.frequency.createMany({ data: FREQUENCIES })
    report.frequencies = created.count
  } else {
    report.skipped.push('frecuencias')
  }

  // --- Especialidades y su filtro de frecuencias --------------------------
  if ((await client.specialty.count()) === 0) {
    for (const seed of SPECIALTIES) {
      const specialty = await client.specialty.create({
        data: { name: seed.name, serviceUnit: seed.serviceUnit },
      })
      report.specialties += 1

      for (const frequency of seed.frequencies) {
        // Se busca por (amount, unit), que es la clave natural. Si esa
        // frecuencia no existe —porque la coordinacion la borro antes de que
        // se sembraran las especialidades— se saltea el vinculo en vez de
        // crearla: no se resucita nada por la puerta de atras.
        const existing = await client.frequency.findUnique({
          where: { amount_unit: { amount: frequency.amount, unit: frequency.unit } },
        })

        if (existing === null) continue

        await client.specialtyFrequency.create({
          data: { specialtyId: specialty.id, frequencyId: existing.id },
        })
        report.specialtyFrequencyLinks += 1
      }
    }
  } else {
    report.skipped.push('especialidades')
  }

  // --- Provincias ---------------------------------------------------------
  if ((await client.province.count()) === 0) {
    const created = await client.province.createMany({
      data: PROVINCES.map((name) => ({ name })),
    })
    report.provinces = created.count
  } else {
    report.skipped.push('provincias')
  }

  return report
}

export interface DemoReport {
  created: boolean
  reason?: string
}

/**
 * Datos de ejemplo para probar la API a mano.
 *
 * Apagado por defecto y separado del catalogo base a proposito: una obra social
 * inventada y una empresa que no existe no tienen NADA que hacer en la
 * instalacion de una coordinacion de verdad. La separacion es lo que impide que
 * lleguen ahi por descuido.
 */
export async function seedDemoData(client: PrismaClient): Promise<DemoReport> {
  if ((await client.insuranceProvider.count()) > 0) {
    return { created: false, reason: 'ya hay obras sociales cargadas' }
  }

  const province = await client.province.findFirst({
    where: { name: 'Ciudad Autónoma de Buenos Aires' },
  })

  if (province === null) {
    return { created: false, reason: 'falta el catálogo de provincias' }
  }

  await client.locality.create({
    data: { provinceId: province.id, name: 'Caballito', postalCode: '1405' },
  })

  const provider = await client.insuranceProvider.create({
    data: { name: 'Obra Social de Ejemplo' },
  })

  const company = await client.contractingCompany.create({
    data: {
      name: 'Empresa de Ejemplo',
      contactName: 'Mesa de autorizaciones',
      contactPhone: '1140000000',
    },
  })

  // El convenio es lo que hace que la obra social sea ALCANZABLE (D2). Sin
  // esta fila, el selector de obras sociales vuelve vacio y los datos de
  // ejemplo no sirven para nada.
  await client.companyInsuranceProvider.create({
    data: { contractingCompanyId: company.id, insuranceProviderId: provider.id },
  })

  const specialties = await client.specialty.findMany({ where: { deletedAt: null } })
  const professional = await client.professional.create({
    data: { lastName: 'Gómez', firstName: 'Yolanda', licenseNumber: 'MP-00000' },
  })

  // Se lo habilita en todas las especialidades sembradas: es un profesional de
  // ejemplo, y limitarlo obligaria a adivinar cual eligio el que prueba.
  for (const specialty of specialties) {
    await client.professionalSpecialty.create({
      data: { professionalId: professional.id, specialtyId: specialty.id },
    })
  }

  return { created: true }
}
