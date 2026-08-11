import { NextRequest, NextResponse } from 'next/server'

import { isAuthorized } from '@/src/api/client-auth'
import { parseConfig } from '@/src/config/env'
import { db } from '@/src/db/client'
import { listLatestArtifactsByModId, type ManifestArtifact } from '@/src/db/queries/artifacts'
import { mcMatchMode, mcVersionMatches, type McMatchMode } from '@/src/builder/mod-metadata'
import { compareModVersions } from '@/src/builder/mod-versions'

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

  for (const mod of mods.values()) {
    mod.versions = newestPerMinecraftVersion(mod.versions)
  }

  return [...mods.values()]
}

/**
 * Keeps only the newest release for each Minecraft version a mod supports.
 *
 * A build's collected artifacts can include JARs left in `build/libs` by earlier
 * builds, so the same mod arrives as 1.17.1 *and* 1.17.2. Publishing both lets a
 * client be offered the older one — a downgrade, and then a flip-flop between
 * the two on every launch. Only the newest can be an update.
 *
 * Grouped by the Minecraft versions the JAR declares, so a multi-version build
 * still publishes one artifact per game version.
 */
function newestPerMinecraftVersion(versions: ManifestVersion[]): ManifestVersion[] {
  const newest = new Map<string, ManifestVersion>()

  for (const version of versions) {
    const key = version.mcVersions.join(',')
    const existing = newest.get(key)

    if (!existing || compareModVersions(version.modVersion, existing.modVersion) > 0) {
      newest.set(key, version)
    }
  }

  return [...newest.values()]
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
