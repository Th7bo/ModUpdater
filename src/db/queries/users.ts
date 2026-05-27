import { eq } from 'drizzle-orm'

import type { Db } from '@/src/db/client'
import { users } from '@/src/db/schema'

export type User = typeof users.$inferSelect
export type UserRole = User['role']

export async function listUsers(db: Db): Promise<User[]> {
  return db.select().from(users).orderBy(users.name)
}

export async function getUser(db: Db, id: string): Promise<User | undefined> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return result[0]
}

export async function updateUserRole(
  db: Db,
  id: string,
  role: 'user' | 'admin'
): Promise<void> {
  await db.update(users).set({ role }).where(eq(users.id, id))
}
