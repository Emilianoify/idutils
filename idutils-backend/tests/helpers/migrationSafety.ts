export interface MigrationLedgerRow {
  migrationName: string
  checksum: string
  finishedAt: Date | null
  rolledBackAt: Date | null
}

export interface ExpectedMigration {
  name: string
  checksum: string
}

const MIGRATIONS_NOT_CURRENT =
  'La base de tests no tiene el historial de migraciones esperado. No se ejecutará ningún reset destructivo.'

export function assertMigrationHistoryCurrent(
  expectedMigrations: readonly ExpectedMigration[],
  ledger: readonly MigrationLedgerRow[],
): void {
  const successful = new Map(
    ledger
      .filter((row) => row.finishedAt !== null && row.rolledBackAt === null)
      .map((row) => [row.migrationName, row.checksum]),
  )
  const expectedNames = expectedMigrations.map((migration) => migration.name)
  const pending = expectedNames.filter((migration) => !successful.has(migration))
  const changed = expectedMigrations
    .filter(
      (migration) =>
        successful.has(migration.name) && successful.get(migration.name) !== migration.checksum,
    )
    .map((migration) => migration.name)
  const failed = ledger
    .filter((row) => row.finishedAt === null && row.rolledBackAt === null)
    .map((row) => row.migrationName)
  const unexpected = [...successful.keys()].filter((migration) => !expectedNames.includes(migration))

  if (pending.length === 0 && changed.length === 0 && failed.length === 0 && unexpected.length === 0) {
    return
  }

  const details = [
    ...(pending.length === 0 ? [] : [`pendientes: ${pending.join(', ')}`]),
    ...(changed.length === 0 ? [] : [`modificadas: ${changed.join(', ')}`]),
    ...(failed.length === 0 ? [] : [`fallidas: ${failed.join(', ')}`]),
    ...(unexpected.length === 0 ? [] : [`desconocidas: ${unexpected.join(', ')}`]),
  ]
  throw new Error(`${MIGRATIONS_NOT_CURRENT} ${details.join('; ')}`)
}
