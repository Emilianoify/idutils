import { describe, expect, it } from 'vitest'
import { AuthorizationStatus } from '../../src/domain/enums/authorizationStatus.js'
import { coverageAt, needsClaim } from '../../src/domain/services/authorizationCoverage.js'
import { authorization, d } from '../helpers/factories.js'

const hoy = d('2026-08-28')

describe('coverageAt', () => {
  it('sin autorizaciones no es lo mismo que vencida', () => {
    // Una prestacion creada y nunca autorizada es otro trabajo pendiente que
    // una que se dejo vencer. Aplanarlas esconde el alta a medio hacer.
    expect(coverageAt([], hoy).status).toBe(AuthorizationStatus.SIN_AUTORIZACION)
  })

  it('con margen de sobra esta vigente', () => {
    const authorizations = [authorization({ validFrom: '2026-08-01', validUntil: '2026-12-31' })]

    const coverage = coverageAt(authorizations, hoy)

    expect(coverage.status).toBe(AuthorizationStatus.VIGENTE)
    expect(coverage.daysUntilExpiry).toBe(125)
  })

  it('dentro del umbral esta por vencer', () => {
    const authorizations = [authorization({ validFrom: '2026-08-01', validUntil: '2026-09-15' })]

    const coverage = coverageAt(authorizations, hoy)

    expect(coverage.status).toBe(AuthorizationStatus.POR_VENCER)
    expect(coverage.daysUntilExpiry).toBe(18)
  })

  it('validUntil es inclusive: el dia que vence todavia cubre', () => {
    // Correr esto un dia es reclamar algo que seguia vigente, o no reclamar el
    // dia que hacia falta.
    const authorizations = [authorization({ validFrom: '2026-08-01', validUntil: '2026-08-28' })]

    const coverage = coverageAt(authorizations, hoy)

    expect(coverage.status).toBe(AuthorizationStatus.POR_VENCER)
    expect(coverage.daysUntilExpiry).toBe(0)

    expect(coverageAt(authorizations, d('2026-08-29')).status).toBe(
      AuthorizationStatus.VENCIDA,
    )
  })

  it('respeta el umbral que configura la coordinacion', () => {
    const authorizations = [authorization({ validFrom: '2026-08-01', validUntil: '2026-09-15' })]

    expect(coverageAt(authorizations, hoy, 10).status).toBe(AuthorizationStatus.VIGENTE)
    expect(coverageAt(authorizations, hoy, 30).status).toBe(AuthorizationStatus.POR_VENCER)
  })

  it('vencida informa desde cuando esta descubierta', () => {
    const vieja = authorization({ validFrom: '2026-01-01', validUntil: '2026-06-30' })
    const masVieja = authorization({ validFrom: '2025-07-01', validUntil: '2025-12-31' })

    const coverage = coverageAt([masVieja, vieja], hoy)

    expect(coverage.status).toBe(AuthorizationStatus.VENCIDA)
    expect(coverage.previous?.id).toBe(vieja.id)
    expect(coverage.current).toBeNull()
  })

  it('entre autorizaciones solapadas gana la que llega mas lejos', () => {
    const corta = authorization({ validFrom: '2026-08-01', validUntil: '2026-09-10' })
    const larga = authorization({ validFrom: '2026-08-15', validUntil: '2026-12-31' })

    const coverage = coverageAt([corta, larga], hoy)

    expect(coverage.current?.id).toBe(larga.id)
    expect(coverage.status).toBe(AuthorizationStatus.VIGENTE)
  })

  it('ve la renovacion ya cargada para mas adelante', () => {
    const actual = authorization({ validFrom: '2026-08-01', validUntil: '2026-09-15' })
    const proxima = authorization({ validFrom: '2026-09-16', validUntil: '2026-12-31' })

    const coverage = coverageAt([actual, proxima], hoy)

    expect(coverage.status).toBe(AuthorizationStatus.POR_VENCER)
    expect(coverage.next?.id).toBe(proxima.id)
  })

  it('ignora las autorizaciones dadas de baja', () => {
    const anulada = authorization({
      validFrom: '2026-08-01',
      validUntil: '2026-12-31',
      deletedAt: d('2026-08-10'),
    })

    expect(coverageAt([anulada], hoy).status).toBe(AuthorizationStatus.SIN_AUTORIZACION)
  })
})

describe('needsClaim', () => {
  it('lo vigente no se reclama', () => {
    const coverage = coverageAt(
      [authorization({ validFrom: '2026-08-01', validUntil: '2026-12-31' })],
      hoy,
    )

    expect(needsClaim(coverage)).toBe(false)
  })

  it('lo que esta por vencer y no se reclamo todavia, si', () => {
    const coverage = coverageAt(
      [authorization({ validFrom: '2026-08-01', validUntil: '2026-09-15' })],
      hoy,
    )

    expect(needsClaim(coverage)).toBe(true)
  })

  it('lo ya reclamado sale de la lista de pendientes', () => {
    // Reclamar de nuevo es ruido, y el ruido es lo que hace que la gente deje
    // de mirar la lista.
    const coverage = coverageAt(
      [
        authorization({
          validFrom: '2026-08-01',
          validUntil: '2026-09-15',
          claimedAt: '2026-08-20',
        }),
      ],
      hoy,
    )

    expect(coverage.status).toBe(AuthorizationStatus.POR_VENCER)
    expect(needsClaim(coverage)).toBe(false)
  })

  it('una vencida con la renovacion ya cargada no se vuelve a reclamar', () => {
    const coverage = coverageAt(
      [
        authorization({ validFrom: '2026-01-01', validUntil: '2026-08-20' }),
        authorization({ validFrom: '2026-09-01', validUntil: '2026-12-31' }),
      ],
      hoy,
    )

    expect(coverage.status).toBe(AuthorizationStatus.VENCIDA)
    expect(needsClaim(coverage)).toBe(false)
  })

  it('una vencida sin nada atras es trabajo pendiente', () => {
    const coverage = coverageAt(
      [authorization({ validFrom: '2026-01-01', validUntil: '2026-08-20' })],
      hoy,
    )

    expect(needsClaim(coverage)).toBe(true)
  })
})
