import express from 'express'
import request from 'supertest'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { Role } from '../../src/generated/prisma/enums.js'
import {
  auditSessionEvent,
  createMutationAudit,
  onResponseSettled,
  sanitizeAuditPath,
} from '../../src/interfaces/http/middlewares/audit.js'

const USER_ID = '83f1077e-a71c-4f45-848b-e3ef508be910'
const RESOURCE_ID = '29395171-3e3a-42dc-82f9-05874895bdf5'

function writer() {
  return { info: vi.fn() }
}

describe('authenticated mutation audit', () => {
  it('records only the verified actor, method, sanitized pathname, status and safe id', async () => {
    const auditWriter = writer()
    const app = express()
    app.use(express.json())
    app.use((incoming, _response, next) => {
      incoming.auth = { userId: USER_ID, role: Role.OPERADOR, tokenVersion: 0 }
      next()
    })
    app.use(createMutationAudit(auditWriter))
    app.post('/api/patients/:id/deactivate', (_incoming, response) => response.sendStatus(409))

    await request(app)
      .post(`/api/patients/${RESOURCE_ID}/deactivate?taxId=query-secret`)
      .set('authorization', 'header-secret')
      .set('cookie', 'access_token=cookie-secret')
      .send({ bankAccount: 'body-secret', healthData: 'diagnosis-secret' })
      .expect(409)

    expect(auditWriter.info).toHaveBeenCalledWith('Authenticated mutation', {
      event: 'authenticated_mutation',
      userId: USER_ID,
      method: 'POST',
      pathname: '/api/patients/:id/deactivate',
      status: 409,
      outcome: 'completed',
      resourceId: RESOURCE_ID,
    })
    expect(JSON.stringify(auditWriter.info.mock.calls)).not.toMatch(
      /query-secret|header-secret|cookie-secret|body-secret|diagnosis-secret|taxId|bankAccount|healthData/,
    )
  })

  it('does not record unauthenticated requests or reads', async () => {
    const auditWriter = writer()
    const app = express()
    app.use(createMutationAudit(auditWriter))
    app.post('/api/patients', (_incoming, response) => response.sendStatus(401))
    app.get('/api/patients', (_incoming, response) => response.sendStatus(200))

    await request(app).post('/api/patients').expect(401)
    await request(app).get('/api/patients').expect(200)

    expect(auditWriter.info).not.toHaveBeenCalled()
  })

  it('redacts unknown path values instead of treating them as identifiers', () => {
    expect(sanitizeAuditPath('/api/patients/tax-secret-123/deactivate?token=query-secret')).toEqual({
      pathname: '/api/patients/:segment/deactivate',
    })
  })

  it('records an aborted response exactly once when close happens before finish', () => {
    const response = new EventEmitter()
    const record = vi.fn()

    onResponseSettled(response, record)
    response.emit('close')
    response.emit('finish')

    expect(record).toHaveBeenCalledOnce()
    expect(record).toHaveBeenCalledWith('aborted')
  })

  it('records a completed response exactly once when finish is followed by close', () => {
    const response = new EventEmitter()
    const record = vi.fn()

    onResponseSettled(response, record)
    response.emit('finish')
    response.emit('close')

    expect(record).toHaveBeenCalledOnce()
    expect(record).toHaveBeenCalledWith('completed')
  })

  it('records refresh and logout without tokens, cookies, body or query values', async () => {
    const auditWriter = writer()
    const app = express()
    app.use(express.json())
    app.post('/api/auth/refresh', (incoming, response) => {
      auditSessionEvent(
        incoming,
        response,
        { event: 'session_refreshed', userId: USER_ID, sessionId: 'session-safe-id' },
        auditWriter,
      )
      response.sendStatus(200)
    })
    app.post('/api/auth/logout', (incoming, response) => {
      auditSessionEvent(
        incoming,
        response,
        { event: 'session_logged_out', userId: USER_ID, sessionId: 'session-safe-id' },
        auditWriter,
      )
      response.sendStatus(200)
    })

    await request(app)
      .post('/api/auth/refresh?token=query-secret')
      .set('authorization', 'header-secret')
      .set('cookie', 'refresh_token=cookie-secret')
      .send({ token: 'body-secret' })
      .expect(200)
    await request(app)
      .post('/api/auth/logout?token=query-secret')
      .set('cookie', 'refresh_token=cookie-secret')
      .expect(200)

    expect(auditWriter.info).toHaveBeenNthCalledWith(1, 'Authenticated session mutation', {
      event: 'session_refreshed',
      userId: USER_ID,
      sessionId: 'session-safe-id',
      method: 'POST',
      pathname: '/api/auth/refresh',
      status: 200,
      outcome: 'completed',
    })
    expect(auditWriter.info).toHaveBeenNthCalledWith(2, 'Authenticated session mutation', {
      event: 'session_logged_out',
      userId: USER_ID,
      sessionId: 'session-safe-id',
      method: 'POST',
      pathname: '/api/auth/logout',
      status: 200,
      outcome: 'completed',
    })
    expect(JSON.stringify(auditWriter.info.mock.calls)).not.toMatch(
      /query-secret|header-secret|cookie-secret|body-secret|refresh_token|authorization/,
    )
  })
})
