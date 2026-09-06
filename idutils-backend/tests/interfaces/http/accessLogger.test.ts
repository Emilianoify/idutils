import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  createAccessLogger,
  sanitizedPathname,
  type AccessLogStream,
} from '../../../src/interfaces/http/middlewares/accessLogger.js'

describe('access logger', () => {
  it('logs request metadata with a pathname and excludes all request values', async () => {
    const lines: string[] = []
    const stream: AccessLogStream = {
      write(message) {
        lines.push(message)
      },
    }
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use(createAccessLogger(stream))
    app.post('/api/patients', (_request, response) => response.status(201).json({ ok: true }))

    await request(app)
      .post('/api/patients?memberNumber=SENSITIVE_MEMBER&text=SENSITIVE_SEARCH')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('Authorization', 'Bearer SENSITIVE_TOKEN')
      .set('Cookie', 'access_token=SENSITIVE_COOKIE')
      .send({ bankAccount: 'SENSITIVE_BANK_ACCOUNT' })
      .expect(201)

    expect(lines).toHaveLength(1)
    const line = lines[0] ?? ''
    expect(line).toContain('203.0.113.9')
    expect(line).toContain('"POST /api/patients HTTP/1.1" 201')
    expect(line).toMatch(/ 201 \d+ [\d.]+ ms/)
    expect(line).not.toContain('SENSITIVE_MEMBER')
    expect(line).not.toContain('SENSITIVE_SEARCH')
    expect(line).not.toContain('SENSITIVE_TOKEN')
    expect(line).not.toContain('SENSITIVE_COOKIE')
    expect(line).not.toContain('SENSITIVE_BANK_ACCOUNT')
    expect(line).not.toContain('?')
  })

  it('fails closed when the request target is malformed', () => {
    const malformedTarget = 'http://[invalid-host?text=SENSITIVE_SEARCH'

    expect(sanitizedPathname(malformedTarget)).toBe('[invalid-target]')
    expect(sanitizedPathname(malformedTarget)).not.toContain('SENSITIVE_SEARCH')
  })
})
