import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getLatestBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'
import { EmptyState, MetaPill, PageHeader, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

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
    <div className="page-stack">
      <PageHeader
        eyebrow="Latest build log"
        title={repo.name}
        description="Inspect the most recent persisted build output for this repository."
        backHref="/repos"
        backLabel="Back to repositories"
        actions={<Link href={`/repos/${id}/builds`} className="btn btn-secondary">All builds</Link>}
      />

      {latestRun ? (
        <div className="meta-strip">
          <StatusBadge status={latestRun.status} />
          <MetaPill>Triggered by {latestRun.triggeredBy}</MetaPill>
          <MetaPill>Started {formatDate(latestRun.startedAt)}</MetaPill>
          {latestRun.finishedAt && <MetaPill>Finished {formatDate(latestRun.finishedAt)}</MetaPill>}
        </div>
      ) : (
        <EmptyState
          title="No builds yet"
          description="Trigger a build or wait for polling or webhook activity to create a first log."
        />
      )}

      {logContent ? (
        <section className="console-panel">
          <div className="console-header">
            <span>latest.log</span>
            <span>{latestRun?.logPath ?? 'stored log'}</span>
          </div>
          <pre className="console-body whitespace-pre-wrap">{logContent}</pre>
        </section>
      ) : latestRun ? (
        <EmptyState
          title="Log file unavailable"
          description="The build exists, but its persisted log file could not be found."
          action={<Link href={`/repos/${id}/builds`} className="btn btn-secondary">View all builds</Link>}
        />
      ) : null}
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
