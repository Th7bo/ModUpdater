import { eq, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { buildRuns } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'

type Db = NodePgDatabase<typeof schema>

export type BuildRun = typeof buildRuns.$inferSelect
export type NewBuildRun = typeof buildRuns.$inferInsert

export async function createBuildRun(db: Db, data: NewBuildRun): Promise<BuildRun> {
  const [row] = await db.insert(buildRuns).values(data).returning()
  if (!row) throw new Error('Insert returned no rows')
  return row
}

export async function listBuildRuns(
  db: Db,
  repoId: string,
  limit?: number
): Promise<BuildRun[]> {
  let query = db
    .select()
    .from(buildRuns)
    .where(eq(buildRuns.repoId, repoId))
    .orderBy(desc(buildRuns.startedAt))

  if (limit) {
    query = query.limit(limit) as typeof query
  }

  return query
}

export async function getLatestBuildRun(
  db: Db,
  repoId: string
): Promise<BuildRun | null> {
  const [row] = await db
    .select()
    .from(buildRuns)
    .where(eq(buildRuns.repoId, repoId))
    .orderBy(desc(buildRuns.startedAt))
    .limit(1)
  return row ?? null
}

export async function getBuildRun(
  db: Db,
  buildId: string
): Promise<BuildRun | null> {
  const [row] = await db
    .select()
    .from(buildRuns)
    .where(eq(buildRuns.id, buildId))
  return row ?? null
}
