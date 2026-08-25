import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'

import { repos } from '@/src/db/schema'
import type * as schema from '@/src/db/schema'
import { scheduleRepo } from './repo-schedule'

type Db = NodePgDatabase<typeof schema>

export async function startAllPollers(db: Db): Promise<void> {
  const activeRepos = await db
    .select()
    .from(repos)
    .where(eq(repos.syncPaused, false))

  console.log(`[scheduler] Scheduling ${activeRepos.length} active repo(s)`)

  for (const repo of activeRepos) {
    scheduleRepo(repo)
  }
}

export { triggerBuild } from './pipeline'
export { debounce } from './debouncer'
export { startPoller, stopPoller, stopAllPollers } from './poller'
export { enqueueBuild, getQueueStats } from './build-queue'
export { syncForkUpstream } from './upstream-sync'
export { startForkSyncPoller, stopForkSyncPoller, stopAllForkSyncPollers } from './fork-sync-poller'
export { scheduleRepo, stopRepoSchedule } from './repo-schedule'
