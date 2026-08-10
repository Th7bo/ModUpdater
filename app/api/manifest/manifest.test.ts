import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockParseConfig = vi.fn()
const mockListLatestArtifactsByModId = vi.fn()

vi.mock('@/src/config/env', () => ({
  parseConfig: () => mockParseConfig(),
}))
vi.mock('@/src/db/client', () => ({ db: {} }))
vi.mock('@/src/db/queries/artifacts', () => ({
  listLatestArtifactsByModId: (...args: unknown[]) => mockListLatestArtifactsByModId(...args),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/manifest/route'

const TOKEN = 'a-client-token'

function request(headers: Record<string, string> = {}, query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/manifest${query}`, { headers })
}

function authed(query = ''): NextRequest {
  return request({ authorization: `Bearer ${TOKEN}` }, query)
}

const row = {
  modId: 'examplemod',
  modVersion: '1.2.3',
  displayName: 'Example Mod',
  loader: 'fabric',
  mcVersions: ['1.21.4'],
  mcVersionsRaw: '1.21.4',
  filename: 'examplemod-1.2.3.jar',
  sha256: 'a'.repeat(64),
  size: 1024,
  buildId: 'build-1',
  builtAt: new Date('2026-02-01T10:00:00.000Z'),
  commitsJson: JSON.stringify([
    { hash: 'newest', author: 'Dev', message: 'Fix the thing' },
    { hash: 'older', author: 'Dev', message: 'Earlier change' },
  ]),
  repoId: 'repo-1',
  repoName: 'example-mod',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockParseConfig.mockReturnValue({
    CLIENT_API_TOKEN: TOKEN,
    BASE_URL: 'https://mods.example.com',
  })
  mockListLatestArtifactsByModId.mockResolvedValue([row])
})

describe('GET /api/manifest — authentication (§12.4)', () => {
  it('accepts a valid bearer token', async () => {
    expect((await GET(authed())).status).toBe(200)
  })

  it('rejects a missing Authorization header', async () => {
    expect((await GET(request())).status).toBe(401)
  })

  it('rejects a wrong token', async () => {
    expect((await GET(request({ authorization: 'Bearer wrong-token' }))).status).toBe(401)
  })

  it('rejects a token of a different length', async () => {
    expect((await GET(request({ authorization: 'Bearer x' }))).status).toBe(401)
  })

  it('rejects a non-Bearer scheme', async () => {
    expect((await GET(request({ authorization: `Basic ${TOKEN}` }))).status).toBe(401)
  })

  it('rejects a bare token with no scheme', async () => {
    expect((await GET(request({ authorization: TOKEN }))).status).toBe(401)
  })

  it('gives the same response body for every rejection', async () => {
    const bodies = await Promise.all(
      [request(), request({ authorization: 'Bearer wrong' }), request({ authorization: TOKEN })].map(
        async (req) => JSON.stringify(await (await GET(req)).json())
      )
    )

    expect(new Set(bodies).size).toBe(1)
  })

  it('returns 503 rather than falling open when no token is configured', async () => {
    mockParseConfig.mockReturnValue({ CLIENT_API_TOKEN: undefined, BASE_URL: 'https://x' })

    const response = await GET(authed())

    expect(response.status).toBe(503)
    expect(mockListLatestArtifactsByModId).not.toHaveBeenCalled()
  })

  it('returns 503 for an empty-string token', async () => {
    mockParseConfig.mockReturnValue({ CLIENT_API_TOKEN: '', BASE_URL: 'https://x' })

    expect((await GET(authed())).status).toBe(503)
  })
})

describe('GET /api/manifest — payload (§12.3)', () => {
  it('returns mods with full version detail', async () => {
    const body = await (await GET(authed())).json()

    expect(body.generatedAt).toBeTypeOf('string')
    expect(body.mods).toHaveLength(1)
    expect(body.mods[0]).toMatchObject({
      modId: 'examplemod',
      displayName: 'Example Mod',
      repoId: 'repo-1',
      repoName: 'example-mod',
    })
    expect(body.mods[0].versions[0]).toMatchObject({
      modVersion: '1.2.3',
      loader: 'fabric',
      mcVersions: ['1.21.4'],
      filename: 'examplemod-1.2.3.jar',
      sha256: 'a'.repeat(64),
      size: 1024,
      buildId: 'build-1',
      builtAt: '2026-02-01T10:00:00.000Z',
    })
  })

  it('builds download URLs from BASE_URL', async () => {
    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions[0].downloadUrl).toBe(
      'https://mods.example.com/api/artifacts/build-1/examplemod-1.2.3.jar'
    )
  })

  it('percent-encodes filenames in download URLs', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, filename: 'example mod+1.21.4.jar' },
    ])

    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions[0].downloadUrl).toBe(
      'https://mods.example.com/api/artifacts/build-1/example%20mod%2B1.21.4.jar'
    )
  })

  it('reports the newest commit that produced the build', async () => {
    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions[0]).toMatchObject({
      commitHash: 'newest',
      commitSummary: 'Fix the thing',
    })
  })

  it('tolerates unparseable or empty commit JSON', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, commitsJson: 'not json' },
      { ...row, modId: 'second', commitsJson: '[]' },
    ])

    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions[0].commitHash).toBeNull()
    expect(body.mods[1].versions[0].commitSummary).toBeNull()
  })

  it('groups several MC-version JARs under one mod (Stonecutter)', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, filename: 'examplemod-1.2.3+1.21.4.jar', mcVersions: ['1.21.4'] },
      { ...row, filename: 'examplemod-1.2.3+1.21.5.jar', mcVersions: ['1.21.5'] },
    ])

    const body = await (await GET(authed())).json()

    expect(body.mods).toHaveLength(1)
    expect(body.mods[0].versions).toHaveLength(2)
  })

  it('keeps the same mod id from different repos separate', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      row,
      { ...row, repoId: 'repo-2', repoName: 'example-mod-fork' },
    ])

    const body = await (await GET(authed())).json()

    expect(body.mods).toHaveLength(2)
    expect(body.mods.map((m: { repoName: string }) => m.repoName)).toEqual([
      'example-mod',
      'example-mod-fork',
    ])
  })

  it('returns an empty mods array when there is nothing built', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([])

    const response = await GET(authed())

    expect(response.status).toBe(200)
    expect((await response.json()).mods).toEqual([])
  })
})

describe('GET /api/manifest — mc filter (§12.3)', () => {
  beforeEach(() => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, filename: 'examplemod+1.21.4.jar', mcVersions: ['1.21.4'] },
      { ...row, filename: 'examplemod+1.21.5.jar', mcVersions: ['1.21.5'] },
    ])
  })

  it('filters to artifacts declaring that exact version', async () => {
    const body = await (await GET(authed('?mc=1.21.4'))).json()

    expect(body.mods[0].versions).toHaveLength(1)
    expect(body.mods[0].versions[0].filename).toBe('examplemod+1.21.4.jar')
  })

  it('returns 200 with no mods when nothing matches', async () => {
    const response = await GET(authed('?mc=1.20.1'))

    expect(response.status).toBe(200)
    expect((await response.json()).mods).toEqual([])
  })

  it('excludes artifacts with unknown compatibility', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, mcVersions: [], mcVersionsRaw: '1.21.x' },
    ])

    const body = await (await GET(authed('?mc=1.21.4'))).json()

    expect(body.mods).toEqual([])
  })

  it('returns everything when no filter is given', async () => {
    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions).toHaveLength(2)
  })

  it('matches a patch release against a tilde range (§12.1)', async () => {
    // SkyHanni declares ~26.1; an instance on 26.1.2 must still be offered it.
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, mcVersions: ['26.1'], mcVersionsRaw: '~26.1' },
    ])

    const body = await (await GET(authed('?mc=26.1.2'))).json()

    expect(body.mods).toHaveLength(1)
    expect(body.mods[0].versions[0].mcVersionMatch).toBe('prefix')
  })

  it('does not let a tilde range leak into the next line', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, mcVersions: ['26.1'], mcVersionsRaw: '~26.1' },
    ])

    expect((await (await GET(authed('?mc=26.2'))).json()).mods).toEqual([])
  })

  it('still requires equality for an exact constraint', async () => {
    mockListLatestArtifactsByModId.mockResolvedValue([
      { ...row, mcVersions: ['1.21.4'], mcVersionsRaw: '1.21.4' },
    ])

    expect((await (await GET(authed('?mc=1.21.5'))).json()).mods).toEqual([])
  })

  it('tells the client how to compare versions', async () => {
    const body = await (await GET(authed())).json()

    expect(body.mods[0].versions[0].mcVersionMatch).toBe('exact')
  })
})
