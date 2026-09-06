import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { logger } from '../../../infrastructure/logging/logger.js'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SAFE_PATH_SEGMENTS = new Set([
  'api',
  'auth',
  'refresh',
  'logout',
  'patients',
  'deactivate',
  'insurance-provider-change',
  'episodes',
  'close',
  'care-services',
  'professional',
  'authorizations',
  'claim',
  'admin',
  'specialties',
  'frequencies',
  'professionals',
  'contracting-companies',
  'insurance-providers',
  'users',
  'password',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AuditLogWriter {
  info(message: string, metadata: Record<string, unknown>): unknown
}

export interface SanitizedAuditPath {
  pathname: string
  resourceId?: string
}

export type AuditOutcome = 'completed' | 'aborted'

interface ResponseLifecycle {
  once(event: 'finish' | 'close', listener: () => void): unknown
}

export interface SessionAuditSubject {
  event: 'session_refreshed' | 'session_logged_out'
  userId: string
  sessionId: string
}

export function sanitizeAuditPath(originalUrl: string): SanitizedAuditPath {
  const queryStart = originalUrl.indexOf('?')
  const rawPathname = queryStart === -1 ? originalUrl : originalUrl.slice(0, queryStart)
  let resourceId: string | undefined
  const segments = rawPathname.split('/').map((segment) => {
    if (segment.length === 0 || SAFE_PATH_SEGMENTS.has(segment)) return segment
    if (UUID_PATTERN.test(segment)) {
      resourceId ??= segment
      return ':id'
    }
    return ':segment'
  })

  return {
    pathname: segments.join('/') || '/',
    ...(resourceId === undefined ? {} : { resourceId }),
  }
}

export function onResponseSettled(
  response: ResponseLifecycle,
  record: (outcome: AuditOutcome) => void,
): void {
  let settled = false

  const recordOnce = (outcome: AuditOutcome): void => {
    if (settled) return
    settled = true
    record(outcome)
  }

  response.once('finish', () => recordOnce('completed'))
  response.once('close', () => recordOnce('aborted'))
}

function registerAuditEvent(
  request: Request,
  response: Response,
  writer: AuditLogWriter,
  message: string,
  metadata: Record<string, unknown>,
): void {
  const path = sanitizeAuditPath(request.originalUrl)

  onResponseSettled(response, (outcome) => {
    writer.info(message, {
      ...metadata,
      method: request.method,
      pathname: path.pathname,
      status: response.statusCode,
      outcome,
      ...(path.resourceId === undefined ? {} : { resourceId: path.resourceId }),
    })
  })
}

export function auditSessionEvent(
  request: Request,
  response: Response,
  subject: SessionAuditSubject,
  writer: AuditLogWriter = logger,
): void {
  registerAuditEvent(request, response, writer, 'Authenticated session mutation', {
    event: subject.event,
    userId: subject.userId,
    sessionId: subject.sessionId,
  })
}

export function createMutationAudit(writer: AuditLogWriter = logger): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const auth = request.auth
    if (auth === undefined || !MUTATING_METHODS.has(request.method)) {
      next()
      return
    }

    registerAuditEvent(request, response, writer, 'Authenticated mutation', {
      event: 'authenticated_mutation',
      userId: auth.userId,
    })

    next()
  }
}
