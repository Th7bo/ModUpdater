import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

import { verifySignature } from './webhook-validation'

function createSignature(secret: string, body: string): string {
  const hmac = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hmac}`
}

describe('verifySignature', () => {
  const secret = 'test-webhook-secret'
  const body = '{"action":"push","ref":"refs/heads/main"}'

  it('returns true for correct secret and unmodified body', () => {
    const header = createSignature(secret, body)
    expect(verifySignature(secret, body, header)).toBe(true)
  })

  it('returns false when body has one character changed', () => {
    const header = createSignature(secret, body)
    const tamperedBody = body.replace('push', 'Pull')
    expect(verifySignature(secret, tamperedBody, header)).toBe(false)
  })

  it('returns false for wrong secret', () => {
    const header = createSignature('wrong-secret', body)
    expect(verifySignature(secret, body, header)).toBe(false)
  })

  it('returns false for null header (missing)', () => {
    expect(verifySignature(secret, body, null)).toBe(false)
  })

  it('returns false for header without sha256= prefix', () => {
    const hmac = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignature(secret, body, hmac)).toBe(false)
  })
})
