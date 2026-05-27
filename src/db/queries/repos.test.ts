import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/src/db/schema'
import { buildRuns, repos } from '@/src/db/schema'
import { listRepos, getRepo, createRepo, updateRepo, deleteRepo } from '@/src/db/queries/repos'
import type { NewRepo } from '@/src/db/queries/repos'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://modupdater:modupdater@localhost:5432/modupdater_test'

const pool = new Pool({ connectionString: TEST_DB_URL })
const db = drizzle(pool, { schema })

const validRepo: NewRepo = {
  name: 'test-mod',
  gitUrl: 'https://github.com/test/mod',
  mode: 'upstream',
  branch: 'main',
  detectionMethod: 'polling',
  discordChannelId: '123456789012345678',
}

beforeEach(async () => {
  await db.delete(buildRuns)
  await db.delete(repos)
})

afterAll(async () => {
  await pool.end()
})

describe('createRepo', () => {
  it('inserts a row and returns the full record with generated id and createdAt', async () => {
    const repo = await createRepo(db, validRepo)
    expect(repo.id).toBeTruthy()
    expect(repo.name).toBe(validRepo.name)
    expect(repo.gitUrl).toBe(validRepo.gitUrl)
    expect(repo.createdAt).toBeInstanceOf(Date)
    expect(repo.syncPaused).toBe(false)
  })
})

describe('getRepo', () => {
  it('returns the correct row by id', async () => {
    const created = await createRepo(db, validRepo)
    const fetched = await getRepo(db, created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.name).toBe(validRepo.name)
  })

  it('returns null for an unknown id', async () => {
    const result = await getRepo(db, '00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })
})

describe('listRepos', () => {
  it('returns all rows in insertion order', async () => {
    await createRepo(db, { ...validRepo, name: 'mod-a' })
    await createRepo(db, { ...validRepo, name: 'mod-b' })
    const list = await listRepos(db)
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('mod-a')
    expect(list[1].name).toBe('mod-b')
  })

  it('returns an empty array when no repos exist', async () => {
    const list = await listRepos(db)
    expect(list).toEqual([])
  })
})

describe('updateRepo', () => {
  it('changes only supplied fields; other fields are unchanged', async () => {
    const created = await createRepo(db, validRepo)
    const updated = await updateRepo(db, created.id, { name: 'updated-mod', syncPaused: true })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('updated-mod')
    expect(updated!.syncPaused).toBe(true)
    expect(updated!.gitUrl).toBe(validRepo.gitUrl)
    expect(updated!.branch).toBe(validRepo.branch)
  })
})

describe('deleteRepo', () => {
  it('removes the row; subsequent getRepo returns null', async () => {
    const created = await createRepo(db, validRepo)
    await deleteRepo(db, created.id)
    const fetched = await getRepo(db, created.id)
    expect(fetched).toBeNull()
  })
})
