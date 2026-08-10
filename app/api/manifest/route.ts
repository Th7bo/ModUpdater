import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'

import { parseConfig } from '@/src/config/env'
import { db } from '@/src/db/client'
import { listLatestArtifactsByModId, type ManifestArtifact } from '@/src/db/queries/artifacts'
import { mcMatchMode, mcVersionMatches, type McMatchMode } from '@/src/builder/mod-metadata'

interface ManifestVersion {
  modVersion: string | null
  loader: string
  mcVersions: string[]
  mcVersionsRaw: string | null
  /** How a client should compare mcVersions against its instance (§12.1). */
  mcVersionMatch: McMatchMode
  filename: string
  sha256: string
  size: number
  downloadUrl: string
  buildId: string
  builtAt: string
  commitHash: string | null
  commitSummary: string | null
}

interface ManifestMod {
  modId: string
  displayName: string | null
  repoId: string
  repoName: string
  versions: ManifestVersion[]
}

/**
 * Constant-time bearer token check (REQUIREMENTS §12.4).
 *
 * Both sides are hashed first so the comparison operates on fixed-length
 * buffers — `timingSafeEqual` throws on a length mismatch, and guarding that
 * with a length check would leak the token's length.
 */
function isAuthorized(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false

  const provided = createHash('sha256').update(header.slice('Bearer '.length)).digest()
  const target = createHash('sha256').update(expected).digest()

  return timingSafeEqual(provided, target)
}

function newestCommit(commitsJson: string): { hash: string | null; summary: string | null } {
  try {
    const parsed: unknown = JSON.parse(commitsJson)
    if (!Array.isArray(parsed) || parsed.length === 0) return { hash: null, summary: null }

    // getNewCommits returns newest first (simple-git log ordering).
    const newest = parsed[0] as Record<string, unknown>
    return {
      hash: typeof newest.hash === 'string' ? newest.hash : null,
      summary: typeof newest.message === 'string' ? newest.message : null,
    }
  } catch {
    return { hash: null, summary: null }
  }
}

function toManifest(rows: ManifestArtifact[], baseUrl: string): ManifestMod[] {
  const mods = new Map<string, ManifestMod>()

  for (const row of rows) {
    // Keyed by repo as well as mod id: an upstream and a personal fork of the
    // same mod share a mod id but are distinct sources, and merging them would
    // hide one behind the other.
    const key = `${row.repoId}:${row.modId}`

    let mod = mods.get(key)
    if (!mod) {
      mod = {
        modId: row.modId,
        displayName: row.displayName,
        repoId: row.repoId,
        repoName: row.repoName,
        versions: [],
      }
      mods.set(key, mod)
    }

    const commit = newestCommit(row.commitsJson)

    mod.versions.push({
      modVersion: row.modVersion,
      loader: row.loader,
      mcVersions: row.mcVersions,
      mcVersionsRaw: row.mcVersionsRaw,
      mcVersionMatch: mcMatchMode(row.mcVersionsRaw),
      filename: row.filename,
      sha256: row.sha256,
      size: row.size,
      downloadUrl: `${baseUrl}/api/artifacts/${row.buildId}/${encodeURIComponent(row.filename)}`,
      buildId: row.buildId,
      builtAt: row.builtAt.toISOString(),
      commitHash: commit.hash,
      commitSummary: commit.summary,
    })
  }

  return [...mods.values()]
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = parseConfig()

  // No token configured means the endpoint is disabled, not open (§12.4).
  if (!config.CLIENT_API_TOKEN) {
    return NextResponse.json({ error: 'Manifest endpoint is not configured' }, { status: 503 })
  }

  if (!isAuthorized(request.headers.get('authorization'), config.CLIENT_API_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await listLatestArtifactsByModId(db)

  const mcFilter = request.nextUrl.searchParams.get('mc')
  const filtered = mcFilter
    ? rows.filter((row) => mcVersionMatches(row.mcVersions, row.mcVersionsRaw, mcFilter))
    : rows

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    mods: toManifest(filtered, config.BASE_URL),
  })
}
