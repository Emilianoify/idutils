export interface DatabaseIdentity {
  systemIdentifier: string
  databaseOid: string
}

export type DatabaseIdentityProbe = (connectionString: string) => Promise<DatabaseIdentity>

interface DatabaseSafetyInput {
  testUrl: string | undefined
  appUrl: string | undefined
}

const MISSING_TEST_DATABASE_URL =
  'Falta TEST_DATABASE_URL. Los tests de integración necesitan una base separada de la de trabajo.'
const MISSING_DATABASE_URL =
  'Falta DATABASE_URL. No se puede comprobar que la base de tests esté separada de la de trabajo.'
const IDENTITY_PROBE_FAILED =
  'No se pudo comprobar de forma segura la identidad de las bases de datos. Revisá la configuración y los permisos de PostgreSQL.'
const SAME_DATABASE =
  'TEST_DATABASE_URL y DATABASE_URL apuntan a la misma base PostgreSQL. Correr los tests así borraría la base de trabajo.'

function isValidIdentity(identity: DatabaseIdentity): boolean {
  return identity.systemIdentifier.length > 0 && identity.databaseOid.length > 0
}

async function readIdentity(
  connectionString: string,
  probe: DatabaseIdentityProbe,
): Promise<DatabaseIdentity> {
  try {
    const identity = await probe(connectionString)
    if (!isValidIdentity(identity)) throw new Error('invalid database identity')
    return identity
  } catch {
    // El error del driver puede incluir la URL completa. No debe salir en el test.
    throw new Error(IDENTITY_PROBE_FAILED)
  }
}

/**
 * Autoriza el uso destructivo solo después de identificar ambos destinos.
 * El OID distingue la base dentro del cluster y system_identifier distingue el
 * cluster aunque dos URLs usen aliases, credenciales u opciones diferentes.
 */
export async function assertDistinctDatabaseIdentities(
  input: DatabaseSafetyInput,
  probe: DatabaseIdentityProbe,
): Promise<void> {
  const testUrl = input.testUrl?.trim()
  const appUrl = input.appUrl?.trim()

  if (testUrl === undefined || testUrl.length === 0) throw new Error(MISSING_TEST_DATABASE_URL)
  if (appUrl === undefined || appUrl.length === 0) throw new Error(MISSING_DATABASE_URL)

  const testIdentity = await readIdentity(testUrl, probe)
  const appIdentity = await readIdentity(appUrl, probe)

  if (
    testIdentity.systemIdentifier === appIdentity.systemIdentifier &&
    testIdentity.databaseOid === appIdentity.databaseOid
  ) {
    throw new Error(SAME_DATABASE)
  }
}
