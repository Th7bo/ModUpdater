import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { LiveLogs } from '@/app/(dashboard)/_components/live-logs'
import { PageHeader, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function LiveLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) notFound()

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Live stream"
        title={repo.name}
        description="Follow the active build log stream as the scheduler emits output."
        backHref={`/repos/${id}/edit`}
        backLabel={`Back to ${repo.name}`}
        actions={(
          <>
            <Link href={`/repos/${id}/builds`} className="btn btn-secondary">Build history</Link>
            <Link href={`/repos/${id}/artifacts`} className="btn btn-secondary">Artifacts</Link>
          </>
        )}
      />

      <div className="meta-strip">
        <StatusBadge status={repo.syncPaused ? 'paused' : repo.lastBuildStatus} />
        <span className="meta-pill">{repo.mode}</span>
        <span className="meta-pill">{repo.branch}</span>
        <span className="meta-pill">{repo.detectionMethod}</span>
      </div>

      <LiveLogs repoId={id} />
    </div>
  )
}
