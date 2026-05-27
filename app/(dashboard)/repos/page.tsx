import Link from 'next/link'
import { db } from '@/src/db/client'
import { listRepos } from '@/src/db/queries/repos'
import { auth } from '@/src/auth'
import { DeleteButton } from '@/app/(dashboard)/_components/delete-button'
import { BuildButton } from '@/app/(dashboard)/_components/build-button'
import { ReenableSyncButton } from '@/app/(dashboard)/_components/reenable-sync-button'
import { EmptyState, PageHeader, Panel, StatTile, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function ReposPage() {
  const session = await auth()
  const isAdmin = session?.user.role === 'admin'
  const repos = await listRepos(db)

  const successful = repos.filter((repo) => repo.lastBuildStatus === 'success').length
  const needsAttention = repos.filter(
    (repo) => repo.syncPaused || repo.lastBuildStatus === 'failed' || repo.lastBuildStatus === 'paused'
  ).length
  const webhookRepos = repos.filter((repo) => repo.detectionMethod === 'webhook').length
  const latestRepo = repos
    .filter((repo) => repo.lastBuildAt)
    .sort((a, b) => (b.lastBuildAt?.getTime() ?? 0) - (a.lastBuildAt?.getTime() ?? 0))[0]

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Repository fleet"
        title="Build operations"
        description="Monitor mod repositories, trigger builds, inspect artifacts, and keep fork synchronization under control."
        actions={isAdmin && (
          <Link href="/repos/new" className="btn btn-primary">Add repository</Link>
        )}
      />

      <div className="metric-grid">
        <StatTile label="Repositories" value={repos.length} detail="Tracked automation targets" />
        <StatTile label="Healthy" value={successful} detail="Last build succeeded" tone="success" />
        <StatTile label="Attention" value={needsAttention} detail="Failed or paused pipelines" tone={needsAttention ? 'danger' : 'neutral'} />
        <StatTile label="Webhooks" value={webhookRepos} detail="Push-driven detection" tone="accent" />
      </div>

      {repos.length === 0 ? (
        <EmptyState
          title="No repositories connected"
          description="Add the first mod repository to start polling, webhook detection, build history, and artifact delivery."
          action={isAdmin && <Link href="/repos/new" className="btn btn-primary">Add repository</Link>}
        />
      ) : (
        <Panel
          title="Repository queue"
          subtitle={latestRepo ? `Latest build activity: ${latestRepo.name} ${formatDate(latestRepo.lastBuildAt)}` : 'No builds have been recorded yet'}
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['Repository', 'Mode', 'Detection', 'Status', 'Last Build', 'Commit', 'Actions'].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repos.map((repo) => (
                  <tr key={repo.id}>
                    <td>
                      <div className="cell-strong">{repo.name}</div>
                      <div className="cell-muted text-xs">{repo.branch}</div>
                    </td>
                    <td className="cell-muted">{repo.mode}</td>
                    <td className="cell-muted">{repo.detectionMethod}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={repo.syncPaused ? 'paused' : repo.lastBuildStatus} />
                        {repo.syncPaused && <span className="cell-muted text-xs">sync paused</span>}
                      </div>
                    </td>
                    <td className="cell-muted whitespace-nowrap">
                      {repo.lastBuildAt ? formatDate(repo.lastBuildAt) : 'never'}
                    </td>
                    <td className="cell-code">
                      {repo.lastCommitHash ? repo.lastCommitHash.slice(0, 7) : 'none'}
                    </td>
                    <td>
                      <div className="action-row">
                        {isAdmin && (
                          <Link href={`/repos/${repo.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        )}
                        {repo.syncPaused ? (
                          isAdmin && <ReenableSyncButton repoId={repo.id} />
                        ) : (
                          <BuildButton repoId={repo.id} />
                        )}
                        <Link href={`/repos/${repo.id}/live`} className="btn btn-secondary btn-sm">Live</Link>
                        {repo.lastBuildAt && (
                          <>
                            <Link href={`/repos/${repo.id}/builds`} className="btn btn-secondary btn-sm">History</Link>
                            <Link href={`/repos/${repo.id}/artifacts`} className="btn btn-secondary btn-sm">Artifacts</Link>
                          </>
                        )}
                        {isAdmin && <DeleteButton id={repo.id} />}
                      </div>
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

function formatDate(date: Date | null): string {
  if (!date) return 'never'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-BE', { month: 'short', day: 'numeric', timeZone: 'Europe/Brussels' })
}
