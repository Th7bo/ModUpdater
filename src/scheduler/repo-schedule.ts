import type { Repo } from '@/src/db/queries/repos'
import { startPoller, stopPoller } from './poller'
import { startForkSyncPoller, stopForkSyncPoller } from './fork-sync-poller'

/**
 * Bring a single repo's background schedule in line with its current row.
 *
 * The two pollers answer different questions, and a repo can need both:
 *   - polling detection (§4.1) watches its own branch for new commits
 *   - fork mode (§4.2.1) periodically checks the upstream remote, whatever the
 *     detection method is — a webhook registered on the fork never fires for
 *     an upstream push, so the poller is the only thing that sees those.
 *
 * Always stops first, so this is safe to call on every create, edit, and
 * un-pause: the repo ends up with exactly the pollers its current state calls
 * for, and the immediate first tick is a no-op when nothing has changed.
 */
export function scheduleRepo(repo: Repo): void {
  stopRepoSchedule(repo.id)

  if (repo.syncPaused) {
    console.log(`[schedule] Repo ${repo.name} is paused, no pollers started`)
    return
  }

  // Never let one repo's failure propagate: at boot it would leave every repo
  // after it in the list unscheduled, and on create the row is already
  // committed, so throwing here would fail the request over a live timer.
  try {
    if (repo.detectionMethod === 'polling') {
      startPoller(repo)
    }

    if (repo.mode === 'fork') {
      startForkSyncPoller(repo)
    }
  } catch (err) {
    console.error(`[schedule] Failed to schedule ${repo.name}:`, err)
  }
}

export function stopRepoSchedule(repoId: string): void {
  stopPoller(repoId)
  stopForkSyncPoller(repoId)
}
