import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'
import { EmptyState, MetaPill, PageHeader, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

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
    <div className="page-stack">
      <PageHeader
        eyebrow="Persisted build log"
        title={repo.name}
        description={`Build ${build.id.slice(0, 8)} was triggered by ${build.triggeredBy}.`}
        backHref={`/repos/${id}/builds`}
        backLabel="Back to build history"
      />

      <div className="meta-strip">
        <StatusBadge status={build.status} />
        <MetaPill>Started {formatDate(build.startedAt)}</MetaPill>
        {build.finishedAt && <MetaPill>Finished {formatDate(build.finishedAt)}</MetaPill>}
        <MetaPill>{build.triggeredBy}</MetaPill>
      </div>

      {logContent ? (
        <section className="console-panel">
          <div className="console-header">
            <span>build.log</span>
            <span>{build.logPath ?? 'stored log'}</span>
          </div>
          <pre className="console-body whitespace-pre-wrap">{logContent}</pre>
        </section>
      ) : (
        <EmptyState
          title="Log file unavailable"
          description="The file may have been deleted, moved, or the build may have run before log persistence was enabled."
        />
      )}
    </div>
  )
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-BE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  }).format(date)
}
