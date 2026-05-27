import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'

function isPathWithinLogDir(logDir: string, targetPath: string): boolean {
  const resolvedLogDir = resolve(logDir)
  const resolvedTarget = resolve(targetPath)
  const relativePath = relative(resolvedLogDir, resolvedTarget)
  return !relativePath.startsWith('..') && !relativePath.startsWith(resolve('/'))
}

export default async function BuildLogPage({
  params,
}: {
  params: Promise<{ id: string; buildId: string }>
}) {
  const { id, buildId } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const build = await getBuildRun(db, buildId)
  if (!build || build.repoId !== id) notFound()

  let logContent: string | null = null
  if (build.logPath) {
    const config = parseConfig()
    const fullLogPath = join(config.LOG_DIR, build.logPath)

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
      <Link href={`/repos/${id}/builds`} className="text-sm text-blue-600 hover:underline inline-block mb-4">
        ← Back to build history
      </Link>

      <h1 className="text-2xl font-semibold mb-2">Build Log: {repo.name}</h1>

      <div className="mb-6 text-sm text-slate-600">
        <p>
          Status: <span className={build.status === 'success' ? 'text-green-600' : 'text-red-600'}>{build.status}</span>
          {' | '}
          Triggered by: {build.triggeredBy}
          {' | '}
          Started: {build.startedAt.toLocaleString('en-BE', { timeZone: 'Europe/Brussels' })}
          {build.finishedAt && (
            <>
              {' | '}
              Finished: {build.finishedAt.toLocaleString('en-BE', { timeZone: 'Europe/Brussels' })}
            </>
          )}
        </p>
      </div>

      {logContent ? (
        <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap">{logContent}</pre>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-slate-600 mb-2">Log file not available for this build.</p>
          <p className="text-sm text-slate-400">
            The log file may have been deleted or this build ran before log persistence was enabled.
          </p>
        </div>
      )}
    </>
  )
}
