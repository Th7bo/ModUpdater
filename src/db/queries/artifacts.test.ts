import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'

import * as schema from '@/src/db/schema'
import { artifacts, buildRuns, repos } from '@/src/db/schema'
import { createRepo } from '@/src/db/queries/repos'
import { createBuildRun } from '@/src/db/queries/build-runs'
import {
  insertArtifacts,
  listArtifactsByBuild,
  listBuildIdsWithArtifacts,
  listLatestArtifactsByModId,
} from './artifacts'
import type { NewArtifact } from './artifacts'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://modupdater:modupdater@localhost:5432/modupdater_test'

const pool = new Pool({ connectionString: TEST_DB_URL })
const db = drizzle(pool, { schema })

let repoId: string
let otherRepoId: string

async function makeBuild(
  targetRepoId: string,
  status: 'success' | 'failed',
  startedAt: Date
): Promise<string> {
  const run = await createBuildRun(db, {
    repoId: targetRepoId,
    status,
    triggeredBy: 'manual',
    commitsJson: JSON.stringify([{ hash: 'abc1234', message: 'a commit' }]),
    startedAt,
    finishedAt: startedAt,
  })
  return run.id
}

function artifactRow(
  buildId: string,
  targetRepoId: string,
  overrides: Partial<NewArtifact> = {}
): NewArtifact {
  return {
    buildId,
    repoId: targetRepoId,
    filename: 'examplemod-1.2.3.jar',
    size: 1024,
    sha256: 'a'.repeat(64),
    modId: 'examplemod',
    modVersion: '1.2.3',
    displayName: 'Example Mod',
    mcVersionsJson: JSON.stringify(['1.21.4']),
    mcVersionsRaw: '1.21.4',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete(artifacts)
  await db.delete(buildRuns)
  await db.delete(repos)

  const repo = await createRepo(db, {
    name: 'example-mod',
    gitUrl: 'https://github.com/test/example-mod',
    mode: 'upstream',
    branch: 'main',
    detectionMethod: 'polling',
    discordChannelId: '123456789',
  })
  repoId = repo.id

  const otherRepo = await createRepo(db, {
    name: 'example-mod-fork',
    gitUrl: 'https://github.com/test/example-mod-fork',
    mode: 'fork',
    branch: 'main',
    detectionMethod: 'polling',
    discordChannelId: '123456789',
  })
  otherRepoId = otherRepo.id
})

afterAll(async () => {
  await pool.end()
})

describe('insertArtifacts', () => {
  it('round-trips all fields', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    const [row] = await insertArtifacts(db, [artifactRow(buildId, repoId)])

    expect(row).toMatchObject({
      buildId,
      repoId,
      filename: 'examplemod-1.2.3.jar',
      size: 1024,
      modId: 'examplemod',
      modVersion: '1.2.3',
      displayName: 'Example Mod',
      loader: 'fabric',
      mcVersionsJson: JSON.stringify(['1.21.4']),
      mcVersionsRaw: '1.21.4',
    })
  })

  it('stores null metadata for an unparseable JAR', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    const [row] = await insertArtifacts(db, [
      artifactRow(buildId, repoId, {
        filename: 'mystery.jar',
        modId: null,
        modVersion: null,
        displayName: null,
        mcVersionsJson: '[]',
        mcVersionsRaw: null,
      }),
    ])

    expect(row?.modId).toBeNull()
    expect(row?.mcVersionsJson).toBe('[]')
  })

  it('is a no-op for an empty list', async () => {
    expect(await insertArtifacts(db, [])).toEqual([])
  })

  it('cascades on build deletion', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    await insertArtifacts(db, [artifactRow(buildId, repoId)])

    await db.delete(buildRuns).where(eq(buildRuns.id, buildId))

    expect(await listArtifactsByBuild(db, buildId)).toEqual([])
  })

  it('cascades on repo deletion', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    await insertArtifacts(db, [artifactRow(buildId, repoId)])

    await db.delete(repos).where(eq(repos.id, repoId))

    expect(await db.select().from(artifacts)).toEqual([])
  })
})

describe('listLatestArtifactsByModId', () => {
  it('returns artifacts from the newest successful build', async () => {
    const older = await makeBuild(repoId, 'success', new Date('2026-01-01'))
    const newer = await makeBuild(repoId, 'success', new Date('2026-02-01'))

    await insertArtifacts(db, [
      artifactRow(older, repoId, { filename: 'examplemod-1.0.0.jar', modVersion: '1.0.0' }),
      artifactRow(newer, repoId, { filename: 'examplemod-2.0.0.jar', modVersion: '2.0.0' }),
    ])

    const result = await listLatestArtifactsByModId(db)

    expect(result).toHaveLength(1)
    expect(result[0]?.modVersion).toBe('2.0.0')
    expect(result[0]?.repoName).toBe('example-mod')
  })

  it('ignores failed builds even when they are newest', async () => {
    const success = await makeBuild(repoId, 'success', new Date('2026-01-01'))
    const failed = await makeBuild(repoId, 'failed', new Date('2026-02-01'))

    await insertArtifacts(db, [
      artifactRow(success, repoId, { modVersion: '1.0.0' }),
      artifactRow(failed, repoId, { modVersion: '2.0.0' }),
    ])

    const result = await listLatestArtifactsByModId(db)

    expect(result).toHaveLength(1)
    expect(result[0]?.modVersion).toBe('1.0.0')
  })

  it('excludes artifacts with no mod id', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())

    await insertArtifacts(db, [
      artifactRow(buildId, repoId),
      artifactRow(buildId, repoId, { filename: 'mystery.jar', modId: null }),
    ])

    const result = await listLatestArtifactsByModId(db)

    expect(result).toHaveLength(1)
    expect(result[0]?.filename).toBe('examplemod-1.2.3.jar')
  })

  it('keeps the same mod id from different repos separate', async () => {
    const upstreamBuild = await makeBuild(repoId, 'success', new Date('2026-01-01'))
    const forkBuild = await makeBuild(otherRepoId, 'success', new Date('2026-02-01'))

    await insertArtifacts(db, [
      artifactRow(upstreamBuild, repoId, { modVersion: '1.0.0' }),
      artifactRow(forkBuild, otherRepoId, { modVersion: '1.0.0-fork' }),
    ])

    const result = await listLatestArtifactsByModId(db)

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.repoName).sort()).toEqual(['example-mod', 'example-mod-fork'])
  })

  it('returns every MC-version JAR from a multi-version build', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())

    await insertArtifacts(db, [
      artifactRow(buildId, repoId, {
        filename: 'examplemod-1.2.3+1.21.4.jar',
        mcVersionsJson: JSON.stringify(['1.21.4']),
      }),
      artifactRow(buildId, repoId, {
        filename: 'examplemod-1.2.3+1.21.5.jar',
        mcVersionsJson: JSON.stringify(['1.21.5']),
      }),
    ])

    const result = await listLatestArtifactsByModId(db)

    expect(result).toHaveLength(2)
    expect(result.flatMap((r) => r.mcVersions).sort()).toEqual(['1.21.4', '1.21.5'])
  })

  it('parses mcVersionsJson into an array', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    await insertArtifacts(db, [
      artifactRow(buildId, repoId, { mcVersionsJson: JSON.stringify(['1.21.4', '1.21.5']) }),
    ])

    expect((await listLatestArtifactsByModId(db))[0]?.mcVersions).toEqual(['1.21.4', '1.21.5'])
  })

  it('returns an empty list when there are no successful builds', async () => {
    await makeBuild(repoId, 'failed', new Date())
    expect(await listLatestArtifactsByModId(db)).toEqual([])
  })
})

describe('listBuildIdsWithArtifacts', () => {
  it('returns each build id once', async () => {
    const buildId = await makeBuild(repoId, 'success', new Date())
    await insertArtifacts(db, [
      artifactRow(buildId, repoId),
      artifactRow(buildId, repoId, { filename: 'other.jar' }),
    ])

    expect(await listBuildIdsWithArtifacts(db)).toEqual([buildId])
  })
})
