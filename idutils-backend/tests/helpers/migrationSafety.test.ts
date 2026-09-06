import { describe, expect, it } from 'vitest'
import {
  assertMigrationHistoryCurrent,
  type ExpectedMigration,
  type MigrationLedgerRow,
} from './migrationSafety.js'

const FINISHED = new Date('2026-01-01T00:00:00.000Z')

function applied(migrationName: string): MigrationLedgerRow {
  return { migrationName, checksum: `${migrationName}-checksum`, finishedAt: FINISHED, rolledBackAt: null }
}

function expected(name: string): ExpectedMigration {
  return { name, checksum: `${name}-checksum` }
}

describe('integration migration preflight', () => {
  it('accepts exactly the successfully applied repository history', () => {
    expect(() =>
      assertMigrationHistoryCurrent([expected('001_init'), expected('002_sessions')], [
        applied('001_init'),
        applied('002_sessions'),
      ]),
    ).not.toThrow()
  })

  it('fails closed and names pending, failed and unknown migrations without connection data', () => {
    const ledger: MigrationLedgerRow[] = [
      applied('001_init'),
      { migrationName: '002_sessions', checksum: 'failed', finishedAt: null, rolledBackAt: null },
      applied('legacy_manual'),
    ]

    expect(() =>
      assertMigrationHistoryCurrent([expected('001_init'), expected('002_sessions')], ledger),
    ).toThrow(
      'pendientes: 002_sessions; fallidas: 002_sessions; desconocidas: legacy_manual',
    )
  })

  it('does not treat a rolled-back attempt as an active failed migration', () => {
    const ledger: MigrationLedgerRow[] = [
      applied('001_init'),
      { migrationName: '002_sessions', checksum: 'rolled-back', finishedAt: null, rolledBackAt: FINISHED },
    ]

    expect(() =>
      assertMigrationHistoryCurrent([expected('001_init'), expected('002_sessions')], ledger),
    ).toThrow(
      'pendientes: 002_sessions',
    )
  })

  it('rejects migration SQL changed after it was applied', () => {
    expect(() =>
      assertMigrationHistoryCurrent([expected('001_init')], [
        { ...applied('001_init'), checksum: 'different-checksum' },
      ]),
    ).toThrow('modificadas: 001_init')
  })
})
