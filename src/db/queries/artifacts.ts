import { eq, and, desc, inArray, isNotNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { artifacts, buildRuns, repos } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'

type Db = NodePgDatabase<typeof schema>

export type Artifact = typeof artifacts.$inferSelect
export type NewArtifact = typeof artifacts.$inferInsert

/** An artifact joined with the build and repo it came from, for the manifest. */
export interface ManifestArtifact {
  modId: string
  modVersion: string | null
  displayName: string | null
  loader: string
  mcVersions: string[]
  mcVersionsRaw: string | null
  filename: string
  sha256: string
  size: number
  buildId: string
  builtAt: Date
  commitsJson: string
  repoId: string
  repoName: string
}

export async function insertArtifacts(db: Db, rows: NewArtifact[]): Promise<Artifact[]> {
  if (rows.length === 0) return []
  return db.insert(artifacts).values(rows).returning()
}

export async function listArtifactsByBuild(db: Db, buildId: string): Promise<Artifact[]> {
  return db.select().from(artifacts).where(eq(artifacts.buildId, buildId))
}

export async function listBuildIdsWithArtifacts(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ buildId: artifacts.buildId }).from(artifacts)
  return rows.map((r) => r.buildId)
}

function parseMcVersions(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Artifacts from the newest *successful* build of each repo (REQUIREMENTS §12.3).
 *
 * Per repo, not merged across repos: two repos may legitimately produce the same
 * mod id (an upstream and a personal fork of it), and each should be offered from
 * its own latest build rather than whichever built most recently overall.
 *
 * Artifacts with no mod id are excluded — a client has no way to match them.
 */
export async function listLatestArtifactsByModId(db: Db): Promise<ManifestArtifact[]> {
  const latestBuilds = await db
    .selectDistinctOn([buildRuns.repoId], {
      id: buildRuns.id,
      repoId: buildRuns.repoId,
    })
    .from(buildRuns)
    .where(eq(buildRuns.status, 'success'))
    .orderBy(buildRuns.repoId, desc(buildRuns.startedAt))

  const buildIds = latestBuilds.map((b) => b.id)
  if (buildIds.length === 0) return []

  const rows = await db
    .select({
      modId: artifacts.modId,
      modVersion: artifacts.modVersion,
      displayName: artifacts.displayName,
      loader: artifacts.loader,
      mcVersionsJson: artifacts.mcVersionsJson,
      mcVersionsRaw: artifacts.mcVersionsRaw,
      filename: artifacts.filename,
      sha256: artifacts.sha256,
      size: artifacts.size,
      buildId: artifacts.buildId,
      builtAt: buildRuns.startedAt,
      commitsJson: buildRuns.commitsJson,
      repoId: repos.id,
      repoName: repos.name,
    })
    .from(artifacts)
    .innerJoin(buildRuns, eq(artifacts.buildId, buildRuns.id))
    .innerJoin(repos, eq(artifacts.repoId, repos.id))
    .where(and(inArray(artifacts.buildId, buildIds), isNotNull(artifacts.modId)))
    .orderBy(artifacts.modId, artifacts.filename)

  return rows.map((row) => ({
    ...row,
    // isNotNull above guarantees this, but the column type stays nullable.
    modId: row.modId as string,
    mcVersions: parseMcVersions(row.mcVersionsJson),
  }))
}
