/**
 * Backfills the `artifacts` table for builds that predate REQUIREMENTS §12.
 *
 * Reads the JARs still on disk under ARTIFACTS_DIR, hashes them, extracts
 * fabric.mod.json, and inserts the rows the build pipeline would have written.
 * Without this the manifest stays empty until every repo happens to rebuild.
 *
 * Safe to run repeatedly: builds that already have artifact rows are skipped,
 * and JARs already pruned by cleanupOldArtifacts are reported and ignored.
 *
 *   pnpm backfill:artifacts
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and, isNotNull } from 'drizzle-orm'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import * as schema from '@/src/db/schema'
import { buildRuns } from '@/src/db/schema'
import { parseConfig } from '@/src/config/env'
import { describeArtifacts } from '@/src/builder/artifacts'
import { insertArtifacts, listBuildIdsWithArtifacts } from '@/src/db/queries/artifacts'

interface LegacyArtifact {
  filename: string
  path: string
  size: number
}

/** Handles both the current {filename,path,size} shape and the older string[]. */
function parseArtifactPaths(raw: string | null): LegacyArtifact[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || parsed.length === 0) return []

    if (typeof parsed[0] === 'string') {
      return (parsed as string[]).map((path) => ({
        filename: path.split(/[/\\]/).pop() || path,
        path,
        size: 0,
      }))
    }

    return (parsed as LegacyArtifact[]).filter((a) => typeof a?.filename === 'string')
  } catch {
    return []
  }
}

/**
 * Prefers the canonical ARTIFACTS_DIR/<buildId>/<filename> location over the
 * recorded path, which was absolute at build time and may not survive a move
 * between host and container.
 */
async function resolveOnDisk(
  artifactsDir: string,
  buildId: string,
  artifact: LegacyArtifact
): Promise<{ path: string; size: number } | null> {
  const candidates = [join(artifactsDir, buildId, artifact.filename), artifact.path]

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile()) return { path: candidate, size: fileStat.size }
    } catch {
      // try the next candidate
    }
  }

  return null
}

async function main(): Promise<void> {
  const config = parseConfig()
  const pool = new Pool({ connectionString: config.DATABASE_URL })
  const db = drizzle(pool, { schema })

  let buildsProcessed = 0
  let buildsSkipped = 0
  let jarsInserted = 0
  let jarsMissing = 0

  try {
    const candidates = await db
      .select()
      .from(buildRuns)
      .where(and(eq(buildRuns.status, 'success'), isNotNull(buildRuns.artifactPathsJson)))

    const alreadyDone = new Set(await listBuildIdsWithArtifacts(db))

    console.log(
      `[backfill] ${candidates.length} successful build(s) with artifacts, ` +
        `${alreadyDone.size} already recorded`
    )

    for (const build of candidates) {
      if (alreadyDone.has(build.id)) {
        buildsSkipped++
        continue
      }

      const recorded = parseArtifactPaths(build.artifactPathsJson)
      const onDisk: LegacyArtifact[] = []

      for (const artifact of recorded) {
        const resolved = await resolveOnDisk(config.ARTIFACTS_DIR, build.id, artifact)
        if (!resolved) {
          jarsMissing++
          continue
        }
        onDisk.push({ filename: artifact.filename, path: resolved.path, size: resolved.size })
      }

      if (onDisk.length === 0) {
        buildsSkipped++
        continue
      }

      const described = await describeArtifacts(onDisk)

      await insertArtifacts(
        db,
        described.map((artifact) => ({
          buildId: build.id,
          repoId: build.repoId,
          filename: artifact.filename,
          size: artifact.size,
          sha256: artifact.sha256,
          modId: artifact.metadata?.modId ?? null,
          modVersion: artifact.metadata?.modVersion ?? null,
          displayName: artifact.metadata?.displayName ?? null,
          mcVersionsJson: JSON.stringify(artifact.metadata?.mcVersions ?? []),
          mcVersionsRaw: artifact.metadata?.mcVersionsRaw ?? null,
        }))
      )

      buildsProcessed++
      jarsInserted += described.length
      console.log(`[backfill] build ${build.id.slice(0, 8)}: ${described.length} artifact(s)`)
    }

    console.log(
      `[backfill] done — ${buildsProcessed} build(s) backfilled, ${buildsSkipped} skipped, ` +
        `${jarsInserted} artifact(s) inserted, ${jarsMissing} JAR(s) no longer on disk`
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exitCode = 1
})
