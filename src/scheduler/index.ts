import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, and } from 'drizzle-orm'

import { repos } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'
import { startPoller } from './poller'

type Db = NodePgDatabase<typeof schema>

export async function startAllPollers(db: Db): Promise<void> {
  const pollingRepos = await db
    .select()
    .from(repos)
    .where(
      and(
        eq(repos.detectionMethod, 'polling'),
        eq(repos.syncPaused, false)
      )
    )

  console.log(`[scheduler] Starting pollers for ${pollingRepos.length} repo(s)`)

  for (const repo of pollingRepos) {
    startPoller(repo)
  }
}

export { triggerBuild } from './pipeline'
export { debounce } from './debouncer'
export { startPoller, stopPoller, stopAllPollers } from './poller'
export { enqueueBuild, getQueueStats } from './build-queue'
