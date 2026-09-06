import type { NextConfig } from 'next'
import { resolveApiBaseUrl } from './config/apiUrl'

resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV)

/**
 * El frontend no habla con la base: habla con la API por HTTP.
 *
 * Por eso no hay nada de Prisma acá, ni un secreto, ni una variable que no
 * pueda estar en el navegador. Lo unico que necesita saber es donde vive la
 * API, y eso viaja como `NEXT_PUBLIC_API_URL`.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
