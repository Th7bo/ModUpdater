import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getLatestBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'

function isPathWithinLogDir(logDir: string, targetPath: string): boolean {
  const resolvedLogDir = resolve(logDir)
  const resolvedTarget = resolve(targetPath)
  const relativePath = relative(resolvedLogDir, resolvedTarget)
  return !relativePath.startsWith('..') && !relativePath.startsWith(resolve('/'))
}

export default async function LogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const latestRun = await getLatestBuildRun(db, id)

  let logContent: string | null = null
  if (latestRun?.logPath) {
    const config = parseConfig()
    const fullLogPath = join(config.LOG_DIR, latestRun.logPath)

    if (isPathWithinLogDir(config.LOG_DIR, fullLogPath)) {
      try {
        logContent = await readFile(fullLogPath, 'utf-8')
      } catch {
        logContent = null
      }
    }
  }

  return (
    <>
      <Link href="/repos" className="text-sm text-blue-600 hover:underline inline-block mb-4">
        ← Back to repos
      </Link>

      <h1 className="text-2xl font-semibold mb-2">Build Log: {repo.name}</h1>

      {latestRun ? (
        <div className="mb-6 text-sm text-slate-600">
          <p>
            Status: <span className={latestRun.status === 'success' ? 'text-green-600' : 'text-red-600'}>{latestRun.status}</span>
            {' | '}
            Triggered by: {latestRun.triggeredBy}
            {' | '}
            Started: {latestRun.startedAt.toLocaleString()}
            {latestRun.finishedAt && (
              <>
                {' | '}
                Finished: {latestRun.finishedAt.toLocaleString()}
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="text-slate-500 mb-6">No builds yet for this repository.</p>
      )}

      {logContent ? (
        <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap">{logContent}</pre>
        </div>
      ) : latestRun ? (
        <p className="text-slate-500">Log file not available.</p>
      ) : null}
    </>
  )
}
