import { parseConfig } from '@/src/config/env'
import type { Repo } from '@/src/db/queries/repos'
import { triggerBuild } from './pipeline'
import { debounce } from './debouncer'

const activePollers = new Map<string, NodeJS.Timeout>()

export function startPoller(repo: Repo): void {
  if (activePollers.has(repo.id)) {
    console.log(`[poller] Poller already running for ${repo.name}`)
    return
  }

  const config = parseConfig()
  const intervalMs = repo.pollingIntervalMs ?? config.DEFAULT_POLLING_INTERVAL_MS

  console.log(`[poller] Starting poller for ${repo.name} (interval: ${intervalMs}ms)`)

  const poll = () => {
    debounce(`repo:${repo.id}`, () => triggerBuild(repo.id, 'poll'))
  }

  poll()

  const interval = setInterval(poll, intervalMs)
  activePollers.set(repo.id, interval)
}

export function stopPoller(repoId: string): void {
  const interval = activePollers.get(repoId)
  if (interval) {
    clearInterval(interval)
    activePollers.delete(repoId)
    console.log(`[poller] Stopped poller for repo ${repoId}`)
  }
}

export function stopAllPollers(): void {
  for (const [repoId, interval] of activePollers) {
    clearInterval(interval)
    console.log(`[poller] Stopped poller for repo ${repoId}`)
  }
  activePollers.clear()
}

export function isPollerRunning(repoId: string): boolean {
  return activePollers.has(repoId)
}
