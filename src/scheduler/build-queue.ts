import { parseConfig } from '@/src/config/env'

type BuildJob = () => Promise<void>

interface QueuedJob {
  job: BuildJob
  resolve: () => void
  reject: (err: Error) => void
}

let activeCount = 0
const queue: QueuedJob[] = []

function getMaxConcurrency(): number {
  const config = parseConfig()
  return config.BUILD_CONCURRENCY
}

async function processNext(): Promise<void> {
  if (queue.length === 0) return
  if (activeCount >= getMaxConcurrency()) return

  const item = queue.shift()
  if (!item) return

  activeCount++

  try {
    await item.job()
    item.resolve()
  } catch (err) {
    item.reject(err instanceof Error ? err : new Error(String(err)))
  } finally {
    activeCount--
    processNext()
  }
}

export function enqueueBuild(job: BuildJob): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject })
    processNext()
  })
}

export function getQueueStats(): { active: number; pending: number } {
  return {
    active: activeCount,
    pending: queue.length,
  }
}
