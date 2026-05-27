import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { listBuildRuns } from '@/src/db/queries/build-runs'
import { EmptyState, PageHeader, Panel, StatTile, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function BuildsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const builds = await listBuildRuns(db, id)
  const successful = builds.filter((build) => build.status === 'success').length
  const failed = builds.filter((build) => build.status === 'failed').length
  const latest = builds[0]

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Build history"
        title={repo.name}
        description="Review pipeline outcomes, durations, trigger sources, and persisted build logs."
        backHref="/repos"
        backLabel="Back to repositories"
        actions={(
          <>
            <Link href={`/repos/${id}/live`} className="btn btn-primary">Live logs</Link>
            <Link href={`/repos/${id}/artifacts`} className="btn btn-secondary">Artifacts</Link>
          </>
        )}
      />

      <div className="metric-grid">
        <StatTile label="Runs" value={builds.length} detail="Recorded build executions" />
        <StatTile label="Passed" value={successful} detail="Successful runs" tone="success" />
        <StatTile label="Failed" value={failed} detail="Runs needing review" tone={failed ? 'danger' : 'neutral'} />
        <StatTile
          label="Latest"
          value={latest ? latest.triggeredBy : 'none'}
          detail={latest ? formatDate(latest.startedAt) : 'No build activity'}
          tone="accent"
        />
      </div>

      {builds.length === 0 ? (
        <EmptyState
          title="No build runs yet"
          description="Builds appear here when polling, webhook events, fork sync, or manual triggers start a pipeline."
        />
      ) : (
        <Panel title="Runs" subtitle={`${builds.length} build${builds.length === 1 ? '' : 's'} recorded`}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['Status', 'Triggered By', 'Started', 'Duration', 'Log'].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {builds.map((build) => (
                  <tr key={build.id}>
                    <td><StatusBadge status={build.status} /></td>
                    <td className="cell-muted">{build.triggeredBy}</td>
                    <td className="cell-muted whitespace-nowrap">{formatDate(build.startedAt)}</td>
                    <td className="cell-muted">{build.finishedAt ? formatDuration(build.startedAt, build.finishedAt) : 'running'}</td>
                    <td>
                      {build.logPath ? (
                        <Link href={`/repos/${id}/builds/${build.id}/log`} className="btn btn-secondary btn-sm">
                          View log
                        </Link>
                      ) : (
                        <span className="cell-muted text-xs">No log</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime()
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${seconds}s`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-BE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  }).format(date)
}
