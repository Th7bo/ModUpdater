import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/src/db/schema'
import { buildRuns, repos } from '@/src/db/schema'
import { createRepo } from '@/src/db/queries/repos'
import { createBuildRun, listBuildRuns, getLatestBuildRun } from './build-runs'
import type { NewBuildRun } from './build-runs'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://modupdater:modupdater@localhost:5432/modupdater_test'

const pool = new Pool({ connectionString: TEST_DB_URL })
const db = drizzle(pool, { schema })

let testRepoId: string
let otherRepoId: string

beforeEach(async () => {
  await db.delete(buildRuns)
  await db.delete(repos)

  const testRepo = await createRepo(db, {
    name: 'test-mod',
    gitUrl: 'https://github.com/test/mod',
    mode: 'upstream',
    branch: 'main',
    detectionMethod: 'polling',
    discordChannelId: '123456789',
  })
  testRepoId = testRepo.id

  const otherRepo = await createRepo(db, {
    name: 'other-mod',
    gitUrl: 'https://github.com/test/other',
    mode: 'upstream',
    branch: 'main',
    detectionMethod: 'polling',
    discordChannelId: '123456789',
  })
  otherRepoId = otherRepo.id
})

afterAll(async () => {
  await pool.end()
})

describe('createBuildRun', () => {
  it('inserts a row and returns the full record including generated id', async () => {
    const data: NewBuildRun = {
      repoId: testRepoId,
      status: 'success',
      triggeredBy: 'poll',
      commitsJson: JSON.stringify([{ hash: 'abc123', message: 'Test' }]),
      artifactPathsJson: JSON.stringify(['/path/to/mod.jar']),
      logTail: 'BUILD SUCCESSFUL',
      startedAt: new Date(),
      finishedAt: new Date(),
    }

    const run = await createBuildRun(db, data)

    expect(run.id).toBeTruthy()
    expect(run.repoId).toBe(testRepoId)
    expect(run.status).toBe('success')
    expect(run.triggeredBy).toBe('poll')
    expect(run.commitsJson).toBe(data.commitsJson)
  })
})

describe('listBuildRuns', () => {
  it('returns runs for specified repo in descending startedAt order, excluding other repos', async () => {
    const oldRun: NewBuildRun = {
      repoId: testRepoId,
      status: 'failed',
      triggeredBy: 'webhook',
      commitsJson: '[]',
      startedAt: new Date('2024-01-01'),
    }
    const newRun: NewBuildRun = {
      repoId: testRepoId,
      status: 'success',
      triggeredBy: 'poll',
      commitsJson: '[]',
      startedAt: new Date('2024-01-02'),
    }
    const otherRun: NewBuildRun = {
      repoId: otherRepoId,
      status: 'success',
      triggeredBy: 'manual',
      commitsJson: '[]',
      startedAt: new Date('2024-01-03'),
    }

    await createBuildRun(db, oldRun)
    await createBuildRun(db, newRun)
    await createBuildRun(db, otherRun)

    const runs = await listBuildRuns(db, testRepoId)

    expect(runs).toHaveLength(2)
    expect(runs[0].status).toBe('success')
    expect(runs[1].status).toBe('failed')
  })
})

describe('getLatestBuildRun', () => {
  it('returns the most recent run; returns null when none exist', async () => {
    const emptyResult = await getLatestBuildRun(db, testRepoId)
    expect(emptyResult).toBeNull()

    await createBuildRun(db, {
      repoId: testRepoId,
      status: 'failed',
      triggeredBy: 'poll',
      commitsJson: '[]',
      startedAt: new Date('2024-01-01'),
    })
    await createBuildRun(db, {
      repoId: testRepoId,
      status: 'success',
      triggeredBy: 'webhook',
      commitsJson: '[]',
      startedAt: new Date('2024-01-02'),
    })

    const latest = await getLatestBuildRun(db, testRepoId)

    expect(latest).not.toBeNull()
    expect(latest!.status).toBe('success')
    expect(latest!.triggeredBy).toBe('webhook')
  })
})
