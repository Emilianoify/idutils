import { createPrismaClient } from '../../src/infrastructure/database/prismaClient.js'
import { seedAdminUser } from './adminUser.js'
import { seedDemoData, seedInstallationCatalog } from './installationCatalog.js'
import { loadSeedEnv } from './seedEnv.js'

/**
 * El seed de instalacion.
 *
 * Se corre UNA vez al instalar, con `pnpm db:seed`. Volver a correrlo es
 * inofensivo: no duplica nada, no pisa la contrasena del administrador y no
 * resucita lo que la coordinacion dio de baja.
 *
 * Nada de lo que imprime es un secreto. La contrasena del administrador entra
 * por el entorno, se hashea y no vuelve a aparecer: ni por consola, ni en un
 * log, ni en el reporte de abajo. Si hace falta recordarla, esta en el `.env`
 * de esa instalacion y en ningun otro lado.
 */
async function main(): Promise<void> {
  const env = loadSeedEnv()
  const client = createPrismaClient(env.DATABASE_URL)

  try {
    const admin = await seedAdminUser(client, {
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
      name: env.SEED_ADMIN_NAME,
    })

    const catalog = await seedInstallationCatalog(client)

    console.log('\nIDUtils — seed de instalación\n')

    console.log(
      admin.created
        ? `  Administrador creado: ${admin.email}`
        : `  Administrador: ${admin.email} ya existía, no se tocó`,
    )

    console.log(`  Frecuencias: ${catalog.frequencies}`)
    console.log(`  Especialidades: ${catalog.specialties}`)
    console.log(`  Frecuencias habilitadas por especialidad: ${catalog.specialtyFrequencyLinks}`)
    console.log(`  Provincias: ${catalog.provinces}`)

    if (catalog.skipped.length > 0) {
      // No es una advertencia: es lo que TIENE que pasar en la segunda corrida.
      console.log(
        `\n  Ya estaban sembrados y no se tocaron: ${catalog.skipped.join(', ')}.`,
      )
      console.log('  Un catálogo con filas no se completa: una fila ausente puede ser una baja.')
    }

    if (env.SEED_DEMO) {
      const demo = await seedDemoData(client)
      console.log(
        demo.created
          ? '\n  Datos de ejemplo cargados: obra social, empresa con convenio, localidad y profesional.'
          : `\n  Datos de ejemplo omitidos: ${demo.reason ?? 'ya había datos'}.`,
      )
    }

    console.log('\nListo. Iniciá sesión con el correo de arriba y la contraseña de tu .env\n')
  } finally {
    await client.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('\nNo se pudo sembrar la base:\n')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
