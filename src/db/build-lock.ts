import type { Pool, QueryResultRow } from 'pg'

type PoolWithConnect = Pick<Pool, 'connect'>
export type ReleaseBuildLock = () => Promise<void>

interface LockRow extends QueryResultRow {
  acquired: boolean
}

export async function tryAcquireBuildLock(
  pool: PoolWithConnect,
  buildKey: string
): Promise<ReleaseBuildLock | null> {
  const client = await pool.connect()

  try {
    const result = await client.query<LockRow>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [buildKey]
    )

    if (!result.rows[0]?.acquired) {
      client.release()
      return null
    }

    let released = false
    return async () => {
      if (released) return
      released = true

      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [buildKey]
        )
      } finally {
        client.release()
      }
    }
  } catch (err) {
    client.release()
    throw err
  }
}
