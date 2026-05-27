import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { updateRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'
import { CopyButton } from '@/app/(dashboard)/_components/copy-button'
import { PageHeader, Panel, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function EditRepoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const action = updateRepoAction.bind(null, id)

  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || 'http'
  const webhookUrl = `${protocol}://${host}/api/webhooks/${repo.id}`

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Repository configuration"
        title={repo.name}
        description={`${repo.mode} repository on ${repo.branch}, using ${repo.detectionMethod} detection.`}
        backHref="/repos"
        backLabel="Back to repositories"
        actions={(
          <>
            <Link href={`/repos/${id}/live`} className="btn btn-primary">Live logs</Link>
            <Link href={`/repos/${id}/builds`} className="btn btn-secondary">Build history</Link>
            <Link href={`/repos/${id}/artifacts`} className="btn btn-secondary">Artifacts</Link>
          </>
        )}
      />

      <div className="metric-grid">
        <div className="stat-tile">
          <div className="stat-label">Build state</div>
          <div className="mt-3"><StatusBadge status={repo.syncPaused ? 'paused' : repo.lastBuildStatus} /></div>
          <div className="stat-detail">{repo.lastBuildAt ? formatDate(repo.lastBuildAt) : 'No build recorded'}</div>
        </div>
        <div className="stat-tile accent">
          <div className="stat-label">Detection</div>
          <div className="stat-value text-xl">{repo.detectionMethod}</div>
          <div className="stat-detail">{repo.pollingIntervalMs ? `${repo.pollingIntervalMs} ms interval` : 'Default interval'}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">JDK</div>
          <div className="stat-value text-xl">{repo.jdkVersion ?? '21'}</div>
          <div className="stat-detail">{repo.customBuildTask || 'Gradle build task'}</div>
        </div>
        <div className="stat-tile warning">
          <div className="stat-label">Latest commit</div>
          <div className="stat-value text-xl cell-code">{repo.lastCommitHash ? repo.lastCommitHash.slice(0, 7) : 'none'}</div>
          <div className="stat-detail">{repo.syncPaused ? 'Synchronization paused' : 'Sync enabled'}</div>
        </div>
      </div>

      {repo.detectionMethod === 'webhook' && (
        <Panel
          title="Webhook endpoint"
          subtitle="Use this endpoint in GitHub with application/json payloads and the configured secret."
          actions={<CopyButton text={webhookUrl} />}
        >
          <code className="code-block block">{webhookUrl}</code>
        </Panel>
      )}

      <RepoForm action={action} defaultValues={repo} repoId={id} submitLabel="Save changes" />
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
