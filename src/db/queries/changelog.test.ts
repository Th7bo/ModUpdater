import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/src/db/schema'
import { artifacts, buildRuns, repos } from '@/src/db/schema'
import { createRepo } from '@/src/db/queries/repos'
import { createBuildRun } from '@/src/db/queries/build-runs'
import { insertArtifacts } from '@/src/db/queries/artifacts'
import { changelogSince } from './changelog'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://modupdater:modupdater@localhost:5432/modupdater_test'

const pool = new Pool({ connectionString: TEST_DB_URL })
const db = drizzle(pool, { schema })

let repoId: string

/** Creates a successful build carrying `commits`, plus its artifact. */
async function build(
  startedAt: Date,
  sha: string,
  commits: { hash: string; author: string; message: string }[]
): Promise<string> {
  const run = await createBuildRun(db, {
    repoId,
    status: 'success',
    triggeredBy: 'poll',
    commitsJson: JSON.stringify(commits),
    startedAt,
    finishedAt: startedAt,
  })

  await insertArtifacts(db, [
    {
      buildId: run.id,
      repoId,
      filename: `skyhanni-${sha}.jar`,
      size: 100,
      sha256: sha,
      modId: 'skyhanni',
      modVersion: '7.44.0',
      displayName: 'SkyHanni',
      mcVersionsJson: JSON.stringify(['26.1']),
      mcVersionsRaw: '~26.1',
    },
  ])

  return run.id
}

beforeEach(async () => {
  await db.delete(artifacts)
  await db.delete(buildRuns)
  await db.delete(repos)

  const repo = await createRepo(db, {
    name: 'SkyHanni',
    gitUrl: 'https://github.com/test/skyhanni',
    mode: 'upstream',
    branch: 'main',
    detectionMethod: 'polling',
    discordChannelId: '123',
  })
  repoId = repo.id
})

afterAll(async () => {
  await pool.end()
})

describe('changelogSince', () => {
  it('returns every commit from the builds after the installed one', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [{ hash: 'c1', author: 'Dev', message: 'first' }])
    await build(new Date('2026-01-02'), 'sha-2', [{ hash: 'c2', author: 'Dev', message: 'second' }])
    await build(new Date('2026-01-03'), 'sha-3', [{ hash: 'c3', author: 'Dev', message: 'third' }])
    await build(new Date('2026-01-04'), 'sha-4', [{ hash: 'c4', author: 'Dev', message: 'fourth' }])

    const changelog = await changelogSince(db, 'skyhanni', 'sha-old')

    expect(changelog.baseKnown).toBe(true)
    expect(changelog.builds).toHaveLength(3)
    expect(changelog.builds.flatMap((b) => b.commits.map((c) => c.message))).toEqual([
      'fourth',
      'third',
      'second',
    ])
  })

  it('excludes the commits already in the installed build', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [{ hash: 'c1', author: 'Dev', message: 'already have this' }])
    await build(new Date('2026-01-02'), 'sha-new', [{ hash: 'c2', author: 'Dev', message: 'new' }])

    const messages = (await changelogSince(db, 'skyhanni', 'sha-old')).builds
      .flatMap((b) => b.commits.map((c) => c.message))

    expect(messages).toEqual(['new'])
  })

  it('returns nothing when already on the newest build', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [{ hash: 'c1', author: 'Dev', message: 'first' }])
    await build(new Date('2026-01-02'), 'sha-new', [{ hash: 'c2', author: 'Dev', message: 'second' }])

    const changelog = await changelogSince(db, 'skyhanni', 'sha-new')

    expect(changelog.baseKnown).toBe(true)
    expect(changelog.builds).toEqual([])
  })

  it('carries every commit in a build, not just the newest', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [])
    await build(new Date('2026-01-02'), 'sha-new', [
      { hash: 'c2', author: 'Dev', message: 'newest of the batch' },
      { hash: 'c1', author: 'Other', message: 'earlier in the same build' },
    ])

    const commits = (await changelogSince(db, 'skyhanni', 'sha-old')).builds[0]!.commits

    expect(commits.map((c) => c.message)).toEqual(['newest of the batch', 'earlier in the same build'])
    expect(commits[0]?.author).toBe('Dev')
  })

  it('falls back to the newest build for a JAR it does not recognise', async () => {
    await build(new Date('2026-01-01'), 'sha-1', [{ hash: 'c1', author: 'Dev', message: 'first' }])
    await build(new Date('2026-01-02'), 'sha-2', [{ hash: 'c2', author: 'Dev', message: 'second' }])

    const changelog = await changelogSince(db, 'skyhanni', 'a-jar-from-somewhere-else')

    expect(changelog.baseKnown).toBe(false)
    expect(changelog.builds).toHaveLength(1)
    expect(changelog.builds[0]?.commits[0]?.message).toBe('second')
  })

  it('returns nothing for an unknown mod', async () => {
    await build(new Date('2026-01-01'), 'sha-1', [{ hash: 'c1', author: 'Dev', message: 'first' }])

    expect(await changelogSince(db, 'notamod', 'sha-1')).toEqual({ baseKnown: false, builds: [] })
  })

  it('tolerates unparseable commit json', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [])
    const run = await createBuildRun(db, {
      repoId,
      status: 'success',
      triggeredBy: 'poll',
      commitsJson: 'not json',
      startedAt: new Date('2026-01-02'),
      finishedAt: new Date('2026-01-02'),
    })
    void run

    const changelog = await changelogSince(db, 'skyhanni', 'sha-old')

    expect(changelog.builds).toHaveLength(1)
    expect(changelog.builds[0]?.commits).toEqual([])
  })

  it('drops the merges the fork sync creates', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [])
    await build(new Date('2026-01-02'), 'sha-new', [
      { hash: 'c1', author: 'Dev', message: 'Fix: Ignore armor slot item movements (#6330)' },
      { hash: 'c2', author: 'Th7bo', message: "Merge remote-tracking branch 'upstream/beta' into beta" },
      { hash: 'c3', author: 'Dev', message: 'cleanup' },
      { hash: 'c4', author: 'Th7bo', message: "Merge branch 'beta' into feature" },
    ])

    const messages = (await changelogSince(db, 'skyhanni', 'sha-old')).builds
      .flatMap((b) => b.commits.map((c) => c.message))

    // "cleanup" stays: uninformative, but it is a real change the user is getting.
    expect(messages).toEqual(['Fix: Ignore armor slot item movements (#6330)', 'cleanup'])
  })

  it('keeps pull request merges, which often carry the only description', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [])
    await build(new Date('2026-01-02'), 'sha-new', [
      { hash: 'c1', author: 'Dev', message: 'Merge pull request #6330 from user/fix-armor-slots' },
    ])

    const messages = (await changelogSince(db, 'skyhanni', 'sha-old')).builds
      .flatMap((b) => b.commits.map((c) => c.message))

    expect(messages).toEqual(['Merge pull request #6330 from user/fix-armor-slots'])
  })

  it('ignores failed builds in between', async () => {
    await build(new Date('2026-01-01'), 'sha-old', [])
    await createBuildRun(db, {
      repoId,
      status: 'failed',
      triggeredBy: 'poll',
      commitsJson: JSON.stringify([{ hash: 'x', author: 'Dev', message: 'never shipped' }]),
      startedAt: new Date('2026-01-02'),
      finishedAt: new Date('2026-01-02'),
    })
    await build(new Date('2026-01-03'), 'sha-new', [{ hash: 'c', author: 'Dev', message: 'shipped' }])

    const messages = (await changelogSince(db, 'skyhanni', 'sha-old')).builds
      .flatMap((b) => b.commits.map((c) => c.message))

    // A failed build delivered nothing, so it has nothing to contribute.
    expect(messages).toEqual(['shipped'])
  })
})
