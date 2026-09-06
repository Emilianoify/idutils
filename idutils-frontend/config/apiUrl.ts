const LOCAL_API_URL = 'http://localhost:4000'

/**
 * Localhost is an explicit development convenience. Production and test
 * environments must provide the public API URL instead of guessing a target.
 */
export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  nodeEnv: string | undefined,
): string {
  const candidate = configuredUrl?.trim()

  if (candidate === undefined || candidate.length === 0) {
    if (nodeEnv === 'development') return LOCAL_API_URL

    throw new Error(
      'NEXT_PUBLIC_API_URL is required outside local development. Set the public HTTPS API URL before building or starting the frontend.',
    )
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid absolute HTTP(S) URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must use HTTP or HTTPS.')
  }

  return url.toString().replace(/\/$/, '')
}
