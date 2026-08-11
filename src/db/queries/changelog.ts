import { eq, and, gt, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { artifacts, buildRuns } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'

type Db = NodePgDatabase<typeof schema>

export interface ChangelogCommit {
  hash: string | null
  author: string | null
  message: string | null
  date: string | null
}

export interface ChangelogBuild {
  buildId: string
  builtAt: Date
  commits: ChangelogCommit[]
}

export interface Changelog {
  /**
   * False when the installed JAR did not come from this platform — a manual
   * download, or a build whose artifacts have since been pruned. The caller
   * then only gets the newest build, because there is no point to measure from.
   */
  baseKnown: boolean
  builds: ChangelogBuild[]
}

function parseCommits(commitsJson: string): ChangelogCommit[] {
  try {
    const parsed: unknown = JSON.parse(commitsJson)
    if (!Array.isArray(parsed)) return []

    return parsed.map((entry) => {
      const commit = entry as Record<string, unknown>
      return {
        hash: typeof commit.hash === 'string' ? commit.hash : null,
        author: typeof commit.author === 'string' ? commit.author : null,
        message: typeof commit.message === 'string' ? commit.message : null,
        date: typeof commit.date === 'string' ? commit.date : null,
      }
    })
  } catch {
    return []
  }
}

/**
 * Everything that changed between the build a JAR came from and the newest one.
 *
 * The installed SHA-256 identifies the build it came from, so "three builds
 * behind" answers correctly without the client having to track build ids.
 */
export async function changelogSince(
  db: Db,
  modId: string,
  fromSha: string
): Promise<Changelog> {
  const [installed] = await db
    .select({ repoId: artifacts.repoId, startedAt: buildRuns.startedAt })
    .from(artifacts)
    .innerJoin(buildRuns, eq(artifacts.buildId, buildRuns.id))
    .where(and(eq(artifacts.modId, modId), eq(artifacts.sha256, fromSha)))
    .limit(1)

  if (!installed) {
    return { baseKnown: false, builds: await latestBuildOf(db, modId) }
  }

  const rows = await db
    .select({
      buildId: buildRuns.id,
      builtAt: buildRuns.startedAt,
      commitsJson: buildRuns.commitsJson,
    })
    .from(buildRuns)
    .where(
      and(
        eq(buildRuns.repoId, installed.repoId),
        eq(buildRuns.status, 'success'),
        gt(buildRuns.startedAt, installed.startedAt)
      )
    )
    .orderBy(desc(buildRuns.startedAt))

  return {
    baseKnown: true,
    builds: rows.map((row) => ({
      buildId: row.buildId,
      builtAt: row.builtAt,
      commits: parseCommits(row.commitsJson),
    })),
  }
}

/** Fallback when the installed JAR cannot be located in build history. */
async function latestBuildOf(db: Db, modId: string): Promise<ChangelogBuild[]> {
  const [row] = await db
    .select({
      buildId: buildRuns.id,
      builtAt: buildRuns.startedAt,
      commitsJson: buildRuns.commitsJson,
    })
    .from(artifacts)
    .innerJoin(buildRuns, eq(artifacts.buildId, buildRuns.id))
    .where(and(eq(artifacts.modId, modId), eq(buildRuns.status, 'success')))
    .orderBy(desc(buildRuns.startedAt))
    .limit(1)

  if (!row) return []

  return [
    {
      buildId: row.buildId,
      builtAt: row.builtAt,
      commits: parseCommits(row.commitsJson),
    },
  ]
}
