import { describe, expect, it } from 'vitest'
import { PatientStatus } from '../../src/domain/enums/patientStatus.js'
import { WorkQueue } from '../../src/domain/enums/workQueue.js'
import { statusAt, workQueueAt } from '../../src/domain/services/patientStatus.js'
import { d, episode } from '../helpers/factories.js'

describe('statusAt', () => {
  it('sin episodios el paciente esta cargado pero no iniciado', () => {
    expect(statusAt([], d('2026-08-28'))).toBe(PatientStatus.SIN_INICIAR)
  })

  it('episodio abierto y ya comenzado es ACTIVO', () => {
    const episodes = [episode({ startsOn: '2026-08-01' })]

    expect(statusAt(episodes, d('2026-08-28'))).toBe(PatientStatus.ACTIVO)
  })

  it('episodio abierto con inicio futuro es REINGRESA, no ACTIVO', () => {
    // "Activo" no es "tiene episodio abierto", sino "abierto Y ya comenzado".
    // Es el tipo de cosa que se hardcodea el primer dia y no se puede desarmar.
    const episodes = [episode({ startsOn: '2026-09-04' })]

    expect(statusAt(episodes, d('2026-08-28'))).toBe(PatientStatus.REINGRESA)
  })

  it('el dia que arranca el episodio ya es ACTIVO', () => {
    const episodes = [episode({ startsOn: '2026-08-28' })]

    expect(statusAt(episodes, d('2026-08-28'))).toBe(PatientStatus.ACTIVO)
  })

  it('el dia que cierra el episodio ya NO es ACTIVO', () => {
    // Rango semiabierto [startsOn, endsOn), igual que la constraint EXCLUDE.
    // Si aca fuera cerrado, un reingreso el mismo dia pasaria la validacion del
    // dominio y despues explotaria en el INSERT.
    const episodes = [
      episode({ startsOn: '2026-08-01', endsOn: '2026-08-28', closeReason: 'INTERNACION' }),
    ]

    expect(statusAt(episodes, d('2026-08-27'))).toBe(PatientStatus.ACTIVO)
    expect(statusAt(episodes, d('2026-08-28'))).toBe(PatientStatus.INTERNADO)
  })

  it('deriva cada motivo de cierre a su estado', () => {
    const cases = [
      ['INTERNACION', PatientStatus.INTERNADO],
      ['CAMBIO_OBRA_SOCIAL', PatientStatus.PENDIENTE_REAUTORIZACION],
      ['FIN_COBERTURA', PatientStatus.PENDIENTE_REAUTORIZACION],
      ['SUSPENSION_EMPRESA', PatientStatus.PENDIENTE_REAUTORIZACION],
      ['ALTA_MEDICA', PatientStatus.EGRESADO],
      ['BAJA_VOLUNTARIA', PatientStatus.EGRESADO],
      ['MUDANZA_FUERA_DE_ZONA', PatientStatus.EGRESADO],
      ['FALLECIMIENTO', PatientStatus.FALLECIDO],
    ] as const

    for (const [closeReason, expected] of cases) {
      const episodes = [
        episode({ startsOn: '2026-01-01', endsOn: '2026-06-01', closeReason }),
      ]

      expect(statusAt(episodes, d('2026-08-28'))).toBe(expected)
    }
  })

  it('ignora los episodios dados de baja', () => {
    const episodes = [
      episode({ startsOn: '2026-08-01', deletedAt: d('2026-08-10') }),
    ]

    expect(statusAt(episodes, d('2026-08-28'))).toBe(PatientStatus.SIN_INICIAR)
  })
})

describe('statusAt como respuesta de auditoria', () => {
  // Cuatro episodios de atencion domiciliaria interrumpidos por tres internaciones.
  const juanPerez = [
    episode({ startsOn: '2026-01-01', endsOn: '2026-01-18', closeReason: 'INTERNACION' }),
    episode({ startsOn: '2026-01-22', endsOn: '2026-07-01', closeReason: 'INTERNACION' }),
    episode({ startsOn: '2026-07-15', endsOn: '2026-08-25', closeReason: 'INTERNACION' }),
    episode({ startsOn: '2026-08-27' }),
  ]

  it('contesta que era el paciente en cada momento del ano', () => {
    expect(statusAt(juanPerez, d('2026-01-10'))).toBe(PatientStatus.ACTIVO)
    expect(statusAt(juanPerez, d('2026-01-20'))).toBe(PatientStatus.INTERNADO)
    expect(statusAt(juanPerez, d('2026-03-15'))).toBe(PatientStatus.ACTIVO)
    expect(statusAt(juanPerez, d('2026-07-05'))).toBe(PatientStatus.INTERNADO)
    expect(statusAt(juanPerez, d('2026-08-28'))).toBe(PatientStatus.ACTIVO)
  })

  it('internado con el reingreso ya cargado es REINGRESA, que es la bandeja util', () => {
    // El 26/8 sigue en el sanatorio, pero el episodio del 27 ya esta abierto.
    // La tabla de D9 da precedencia al episodio abierto: lo que el operador
    // necesita ver es "vuelve manana", no "esperando alta".
    expect(statusAt(juanPerez, d('2026-08-26'))).toBe(PatientStatus.REINGRESA)
  })

  it('no lee cierres posteriores a la fecha consultada', () => {
    // Sin el filtro `endsOn <= fecha`, preguntar por el 15 de marzo leeria el
    // cierre de agosto y contestaria con informacion que en marzo no existia.
    expect(statusAt(juanPerez, d('2026-03-15'))).not.toBe(PatientStatus.INTERNADO)
  })

  it('un episodio abierto hoy no vuelve REINGRESA a todo el pasado', () => {
    // La version ingenua de la regla ("existe algun episodio abierto que
    // empiece despues de la fecha") contesta REINGRESA para enero, porque el
    // episodio del 27/8 tambien empieza despues de enero. Se rompe la
    // auditoria entera y la respuesta sigue pareciendo razonable.
    expect(statusAt(juanPerez, d('2026-01-20'))).toBe(PatientStatus.INTERNADO)
    expect(statusAt(juanPerez, d('2026-07-05'))).toBe(PatientStatus.INTERNADO)
  })

  it('antes del primer episodio el paciente todavia no habia empezado', () => {
    expect(statusAt(juanPerez, d('2025-12-31'))).toBe(PatientStatus.SIN_INICIAR)
  })
})

describe('workQueueAt', () => {
  it('el internado espera alta y no desaparece de la pantalla', () => {
    // Si el paciente internado desaparece, volvimos a que la coordinadora se
    // acuerde de memoria, que es el problema que IDUtils vino a resolver.
    const episodes = [
      episode({
        startsOn: '2026-01-01',
        endsOn: '2026-08-25',
        closeReason: 'INTERNACION',
        closeNote: 'Sanatorio Anchorena',
      }),
    ]

    expect(workQueueAt(episodes, d('2026-08-28'))).toBe(WorkQueue.ESPERANDO_ALTA)
  })

  it('la caida de cobertura manda a reautorizar', () => {
    const reasons = ['CAMBIO_OBRA_SOCIAL', 'FIN_COBERTURA', 'SUSPENSION_EMPRESA'] as const

    for (const closeReason of reasons) {
      const episodes = [
        episode({ startsOn: '2026-01-01', endsOn: '2026-08-01', closeReason }),
      ]

      expect(workQueueAt(episodes, d('2026-08-28'))).toBe(WorkQueue.REAUTORIZAR)
    }
  })

  it('el fallecimiento va a archivo, no a una bandeja de trabajo', () => {
    const episodes = [
      episode({ startsOn: '2026-01-01', endsOn: '2026-08-01', closeReason: 'FALLECIMIENTO' }),
    ]

    expect(workQueueAt(episodes, d('2026-08-28'))).toBe(WorkQueue.ARCHIVO)
  })

  it('el paciente activo no ocupa ninguna bandeja', () => {
    expect(workQueueAt([episode({ startsOn: '2026-08-01' })], d('2026-08-28'))).toBeNull()
  })
})
