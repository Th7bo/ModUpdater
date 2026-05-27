import { parseConfig } from '@/src/config/env'
import type { Repo } from '@/src/db/queries/repos'
import { syncForkUpstream } from './upstream-sync'

const activeForkPollers = new Map<string, NodeJS.Timeout>()

export function startForkSyncPoller(repo: Repo): void {
  if (activeForkPollers.has(repo.id)) {
    console.log(`[fork-sync-poller] Poller already running for ${repo.name}`)
    return
  }

  if (repo.mode !== 'fork') {
    console.log(`[fork-sync-poller] Repo ${repo.name} is not a fork, skipping`)
    return
  }

  if (!repo.upstreamUrl) {
    console.log(`[fork-sync-poller] Repo ${repo.name} has no upstream URL, skipping`)
    return
  }

  const config = parseConfig()
  const intervalMs = repo.pollingIntervalMs ?? config.DEFAULT_POLLING_INTERVAL_MS

  console.log(`[fork-sync-poller] Starting fork sync poller for ${repo.name} (interval: ${intervalMs}ms)`)

  const poll = () => {
    syncForkUpstream(repo.id).catch((err) => {
      console.error(`[fork-sync-poller] Error syncing ${repo.name}:`, err)
    })
  }

  poll()

  const interval = setInterval(poll, intervalMs)
  activeForkPollers.set(repo.id, interval)
}

export function stopForkSyncPoller(repoId: string): void {
  const interval = activeForkPollers.get(repoId)
  if (interval) {
    clearInterval(interval)
    activeForkPollers.delete(repoId)
    console.log(`[fork-sync-poller] Stopped fork sync poller for repo ${repoId}`)
  }
}

export function stopAllForkSyncPollers(): void {
  for (const [repoId, interval] of activeForkPollers) {
    clearInterval(interval)
    console.log(`[fork-sync-poller] Stopped fork sync poller for repo ${repoId}`)
  }
  activeForkPollers.clear()
}

export function isForkSyncPollerRunning(repoId: string): boolean {
  return activeForkPollers.has(repoId)
}
