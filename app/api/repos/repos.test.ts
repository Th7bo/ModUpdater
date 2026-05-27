import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Session } from 'next-auth'

vi.mock('@/src/auth', () => ({ auth: vi.fn() }))
vi.mock('@/src/db/client', () => ({ db: {} }))
vi.mock('@/src/db/queries/repos', () => ({
  listRepos: vi.fn(),
  getRepo: vi.fn(),
  createRepo: vi.fn(),
  updateRepo: vi.fn(),
  deleteRepo: vi.fn(),
  toPublicRepo: vi.fn((r: Record<string, unknown>) => {
    const { sshPrivateKeyPath: _1, webhookSecret: _2, ...safe } = r
    return safe
  }),
}))

import { GET as listHandler, POST as createHandler } from '@/app/api/repos/route'
import { GET as getHandler, PATCH as patchHandler, DELETE as deleteHandler } from '@/app/api/repos/[id]/route'
import { auth } from '@/src/auth'
import { getRepo, createRepo, updateRepo, deleteRepo, listRepos } from '@/src/db/queries/repos'

const mockSession: Session = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
  expires: new Date(Date.now() + 3_600_000).toISOString(),
}

const mockRepo = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'test-mod',
  gitUrl: 'https://github.com/test/mod',
  mode: 'upstream' as const,
  branch: 'main',
  detectionMethod: 'polling' as const,
  pollingIntervalMs: null,
  discordChannelId: '123456789012345678',
  customBuildTask: null,
  jdkVersion: '21' as const,
  sshPrivateKeyPath: '/data/keys/secret.pem',
  sshPublicKey: null,
  webhookSecret: 'super-secret-value',
  upstreamUrl: null,
  syncPaused: false,
  lastCommitHash: null,
  lastBuildStatus: null,
  lastBuildAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const validCreateBody = {
  name: 'my-mod',
  gitUrl: 'https://github.com/test/my-mod',
  mode: 'upstream',
  branch: 'main',
  detectionMethod: 'polling',
  discordChannelId: '123456789012345678',
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init)
}

beforeEach(() => {
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue(mockSession)
})

// ─── POST /api/repos ─────────────────────────────────────────────────────────

describe('POST /api/repos', () => {
  it('returns 201 and the created repo without sensitive fields', async () => {
    vi.mocked(createRepo).mockResolvedValue(mockRepo)

    const res = await createHandler(
      makeRequest('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify(validCreateBody),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('test-mod')
    expect(body).not.toHaveProperty('sshPrivateKeyPath')
    expect(body).not.toHaveProperty('webhookSecret')
  })

  it('returns 400 with Zod issues when a required field is missing', async () => {
    const res = await createHandler(
      makeRequest('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ gitUrl: 'https://github.com/test/mod' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.issues).toBeDefined()
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it('returns 401 when no session is present', async () => {
    vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue(null)

    const res = await createHandler(
      makeRequest('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify(validCreateBody),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(res.status).toBe(401)
  })
})

// ─── GET /api/repos/[id] ─────────────────────────────────────────────────────

describe('GET /api/repos/[id]', () => {
  it('returns 200 and the repo without sensitive fields', async () => {
    vi.mocked(getRepo).mockResolvedValue(mockRepo)

    const res = await getHandler(
      makeRequest('http://localhost/api/repos/valid-id'),
      { params: Promise.resolve({ id: 'valid-id' }) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(mockRepo.id)
    expect(body).not.toHaveProperty('sshPrivateKeyPath')
    expect(body).not.toHaveProperty('webhookSecret')
  })

  it('returns 404 for an unknown id', async () => {
    vi.mocked(getRepo).mockResolvedValue(null)

    const res = await getHandler(
      makeRequest('http://localhost/api/repos/unknown'),
      { params: Promise.resolve({ id: 'unknown' }) }
    )

    expect(res.status).toBe(404)
  })
})

// ─── PATCH /api/repos/[id] ───────────────────────────────────────────────────

describe('PATCH /api/repos/[id]', () => {
  it('returns 404 for an unknown id', async () => {
    vi.mocked(updateRepo).mockResolvedValue(null)

    const res = await patchHandler(
      makeRequest('http://localhost/api/repos/unknown', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'new-name' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'unknown' }) }
    )

    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/repos/[id] ──────────────────────────────────────────────────

describe('DELETE /api/repos/[id]', () => {
  it('returns 204 with empty body', async () => {
    vi.mocked(getRepo).mockResolvedValue(mockRepo)
    vi.mocked(deleteRepo).mockResolvedValue(undefined)

    const res = await deleteHandler(
      makeRequest('http://localhost/api/repos/valid-id', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'valid-id' }) }
    )

    expect(res.status).toBe(204)
    const text = await res.text()
    expect(text).toBe('')
  })
})

// ─── Auth guard (any write route) ────────────────────────────────────────────

describe('auth guard', () => {
  it('returns 401 on PATCH when no session is present', async () => {
    vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue(null)

    const res = await patchHandler(
      makeRequest('http://localhost/api/repos/any-id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'any-id' }) }
    )

    expect(res.status).toBe(401)
  })

  it('returns 401 on DELETE when no session is present', async () => {
    vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue(null)

    const res = await deleteHandler(
      makeRequest('http://localhost/api/repos/any-id', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'any-id' }) }
    )

    expect(res.status).toBe(401)
  })
})

// ─── List ─────────────────────────────────────────────────────────────────────

describe('GET /api/repos', () => {
  it('returns the repo list without sensitive fields', async () => {
    vi.mocked(listRepos).mockResolvedValue([mockRepo])

    const res = await listHandler()
    expect(res.status).toBe(200)
    const body: unknown[] = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).not.toHaveProperty('sshPrivateKeyPath')
    expect(body[0]).not.toHaveProperty('webhookSecret')
  })
})
