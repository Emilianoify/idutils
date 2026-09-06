import type { Request, RequestHandler, Response } from 'express'
import morgan from 'morgan'

const ACCESS_LOG_BASE_URL = 'http://access-log.invalid'
const INVALID_REQUEST_TARGET = '[invalid-target]'

export interface AccessLogStream {
  write(message: string): void
}

/**
 * Extracts only the pathname from an HTTP request target. Query values and URL
 * credentials are discarded by the URL parser; malformed targets return a
 * fixed marker so the unsafe input never reaches the log as a fallback.
 */
export function sanitizedPathname(requestTarget: string): string {
  try {
    const url = new URL(requestTarget, ACCESS_LOG_BASE_URL)
    return url.pathname.length > 0 ? url.pathname : '/'
  } catch {
    return INVALID_REQUEST_TARGET
  }
}

function tokenValue(
  tokens: morgan.TokenIndexer<Request, Response>,
  name: string,
  request: Request,
  response: Response,
  argument?: string,
): string {
  const token = tokens[name]
  return token?.(request, response, argument) ?? '-'
}

const accessLogFormat: morgan.FormatFn<Request, Response> = (tokens, request, response) => {
  const remoteAddress = tokenValue(tokens, 'remote-addr', request, response)
  const date = tokenValue(tokens, 'date', request, response, 'clf')
  const method = tokenValue(tokens, 'method', request, response)
  const httpVersion = tokenValue(tokens, 'http-version', request, response)
  const status = tokenValue(tokens, 'status', request, response)
  const responseSize = tokenValue(tokens, 'res', request, response, 'content-length')
  const responseTime = tokenValue(tokens, 'response-time', request, response)
  const pathname = sanitizedPathname(request.originalUrl)

  return `${remoteAddress} [${date}] "${method} ${pathname} HTTP/${httpVersion}" ${status} ${responseSize} ${responseTime} ms`
}

/**
 * Access logging deliberately excludes request headers and bodies. In
 * particular, it never emits cookies, authorization, referrers, or raw URLs.
 */
export function createAccessLogger(stream?: AccessLogStream): RequestHandler {
  return morgan(accessLogFormat, stream === undefined ? undefined : { stream })
}
