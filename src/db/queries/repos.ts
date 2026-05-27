import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { repos } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'

type Db = NodePgDatabase<typeof schema>

export type Repo = typeof repos.$inferSelect
export type NewRepo = typeof repos.$inferInsert

export async function listRepos(db: Db): Promise<Repo[]> {
  return db.select().from(repos).orderBy(repos.createdAt)
}

export async function getRepo(db: Db, id: string): Promise<Repo | null> {
  const [row] = await db.select().from(repos).where(eq(repos.id, id))
  return row ?? null
}

export async function createRepo(db: Db, data: NewRepo): Promise<Repo> {
  const [row] = await db.insert(repos).values(data).returning()
  if (!row) throw new Error('Insert returned no rows')
  return row
}

export async function updateRepo(
  db: Db,
  id: string,
  patch: Partial<Omit<NewRepo, 'id' | 'createdAt'>>
): Promise<Repo | null> {
  const [row] = await db
    .update(repos)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(repos.id, id))
    .returning()
  return row ?? null
}

export async function deleteRepo(db: Db, id: string): Promise<void> {
  await db.delete(repos).where(eq(repos.id, id))
}

export async function pauseRepo(
  db: Db,
  id: string,
  reason?: string
): Promise<Repo | null> {
  const [row] = await db
    .update(repos)
    .set({ syncPaused: true, updatedAt: new Date() })
    .where(eq(repos.id, id))
    .returning()
  if (reason) {
    console.log(`[repos] Paused ${id}: ${reason}`)
  }
  return row ?? null
}

export async function unpauseRepo(db: Db, id: string): Promise<Repo | null> {
  const [row] = await db
    .update(repos)
    .set({ syncPaused: false, updatedAt: new Date() })
    .where(eq(repos.id, id))
    .returning()
  return row ?? null
}

export type PublicRepo = Omit<Repo, 'sshPrivateKeyPath' | 'webhookSecret'>

export function toPublicRepo(repo: Repo): PublicRepo {
  const { sshPrivateKeyPath: _1, webhookSecret: _2, ...safe } = repo
  return safe
}
