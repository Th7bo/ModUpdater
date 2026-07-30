import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'

import { tryAcquireBuildLock } from './build-lock'

function createPool(acquired: boolean) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ acquired }] })
    .mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }] })
  const release = vi.fn()
  const pool = {
    connect: vi.fn().mockResolvedValue({ query, release }),
  } as unknown as Pick<Pool, 'connect'>

  return { pool, query, release }
}

describe('tryAcquireBuildLock', () => {
  it('holds a PostgreSQL advisory lock until the returned release function runs', async () => {
    const { pool, query, release } = createPool(true)

    const releaseLock = await tryAcquireBuildLock(pool, 'repo-id:commit-sha')

    expect(releaseLock).toBeTypeOf('function')
    expect(release).not.toHaveBeenCalled()

    await releaseLock!()

    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
      ['repo-id:commit-sha']
    )
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('returns null and releases the connection when another process owns the lock', async () => {
    const { pool, query, release } = createPool(false)

    const releaseLock = await tryAcquireBuildLock(pool, 'repo-id:commit-sha')

    expect(releaseLock).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
