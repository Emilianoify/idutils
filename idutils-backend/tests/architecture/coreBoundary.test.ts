import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * El test fisico de D4: la direccion de dependencia es modulos -> core, jamas
 * al reves. El core no sabe que los modulos existen.
 *
 * Vive como test y no como parrafo en un markdown a proposito. Una regla que
 * no falla el build es una intencion, y las intenciones se erosionan: alcanza
 * con un PR apurado que agregue `routeId` "por ahora" para que el core deje de
 * ser modular y pase a ser un monolito con un `if`.
 *
 * SE VERIFICA SOBRE EL CODIGO DEL SCHEMA, NO SOBRE LOS COMENTARIOS. Los
 * comentarios que nombran a los modulos ("no lleva auditedByAmanda: eso es del
 * modulo Amanda") son parte de la defensa, no una violacion: son la nota que
 * frena a quien esta por reponer esa columna.
 */

const SCHEMA_PATH = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url))

/** Cada modulo con el termino que jamas puede nombrar una tabla, columna o enum del core. */
const MODULE_TERMS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Amanda', /amanda/i],
  ['Recorridos', /\broutes?\b|recorrido/i],
  ['Recorridos (zonas)', /\bzones?\b|\bzona/i],
]

/** Deja solo codigo: fuera `///` de doc, `//` de linea y `/* *\/` de bloque. */
function stripComments(schema: string): string {
  return schema
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
}

describe('borde del core (D4)', () => {
  const schemaCode = stripComments(readFileSync(SCHEMA_PATH, 'utf8'))

  it.each(MODULE_TERMS)(
    'ninguna tabla, columna o enum del core nombra al modulo %s',
    (_module, term) => {
      expect(schemaCode).not.toMatch(term)
    },
  )

  it('Patient no absorbe lo que pertenece a Affiliation, CareService ni a los episodios (D7, D8, D9)', () => {
    const patientModel = schemaCode.match(/model Patient \{[\s\S]*?\n\}/)?.[0]
    expect(patientModel).toBeDefined()

    // Los cuatro campos que el Excel aplana sobre el paciente y que aca son
    // derivados o viven en otra entidad.
    expect(patientModel).not.toMatch(/insuranceProviderId|memberNumber|contractingCompanyId|\bstatus\b|\bestado\b/i)
  })

  it('la prestacion cuelga del episodio y no del paciente (D9)', () => {
    const careService = schemaCode.match(/model CareService \{[\s\S]*?\n\}/)?.[0]
    expect(careService).toBeDefined()

    expect(careService).toMatch(/episodeId\s+String/)
    expect(careService).not.toMatch(/patientId/)
  })

  it('startsOn es un dato de entrada, jamas now() (D9)', () => {
    const episode = schemaCode.match(/model HomeCareEpisode \{[\s\S]*?\n\}/)?.[0]
    expect(episode).toBeDefined()

    expect(episode).toMatch(/startsOn\s+DateTime\s+@db\.Date\s*$/m)
  })

  it('la autorizacion congela el valor de la frecuencia, no solo la referencia (D10)', () => {
    const authorization = schemaCode.match(/model Authorization \{[\s\S]*?\n\}/)?.[0]
    expect(authorization).toBeDefined()

    expect(authorization).toMatch(/frequencyId\s+String/)
    expect(authorization).toMatch(/frequencyAmount\s+Int/)
    expect(authorization).toMatch(/frequencyUnit\s+FrequencyUnit/)
  })
})
