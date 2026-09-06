import { createTestClient } from './helpers/database.js'

const client = await createTestClient()
await client.$disconnect()
