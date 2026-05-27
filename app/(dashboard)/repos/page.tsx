import Link from 'next/link'
import { db } from '@/src/db/client'
import { listRepos } from '@/src/db/queries/repos'
import { auth } from '@/src/auth'
import { DeleteButton } from '@/app/(dashboard)/_components/delete-button'
import { BuildButton } from '@/app/(dashboard)/_components/build-button'
import { ReenableSyncButton } from '@/app/(dashboard)/_components/reenable-sync-button'
import type { Repo } from '@/src/db/queries/repos'

export default async function ReposPage() {
  const session = await auth()
  const isAdmin = session?.user.role === 'admin'
  const repos = await listRepos(db)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Repositories</h1>
        {isAdmin && (
          <Link href="/repos/new" className="btn btn-primary">Add repository</Link>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="text-slate-500">
          No repositories yet.
          {isAdmin && (
            <>
              {' '}<Link href="/repos/new" className="text-blue-600 hover:underline">Add one</Link>{' '}
              to get started.
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Name', 'Mode', 'Branch', 'Status', 'Last Build', 'Last Commit', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">{repo.name}</td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">{repo.mode}</td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">{repo.branch}</td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                    <span className={statusClass(repo.lastBuildStatus)}>
                      {repo.lastBuildStatus ?? 'none'}
                    </span>
                    {repo.syncPaused && (
                      <span className="ml-2 text-xs text-orange-600 font-medium">(paused)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle text-slate-600 whitespace-nowrap">
                    {repo.lastBuildAt ? formatDate(repo.lastBuildAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle font-mono text-xs text-slate-600">
                    {repo.lastCommitHash ? repo.lastCommitHash.slice(0, 7) : '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                    <div className="flex gap-2 items-center">
                      {isAdmin && (
                        <Link href={`/repos/${repo.id}/edit`} className="btn btn-secondary">Edit</Link>
                      )}
                      {repo.syncPaused ? (
                        isAdmin && <ReenableSyncButton repoId={repo.id} />
                      ) : (
                        <BuildButton repoId={repo.id} />
                      )}
                      <Link href={`/repos/${repo.id}/live`} className="btn btn-secondary">Live</Link>
                      {repo.lastBuildAt && (
                        <>
                          <Link href={`/repos/${repo.id}/builds`} className="btn btn-secondary">History</Link>
                          <Link href={`/repos/${repo.id}/artifacts`} className="btn btn-secondary">Artifacts</Link>
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
      )}
    </>
  )
}

function statusClass(status: Repo['lastBuildStatus']) {
  switch (status) {
    case 'success': return 'status status-success'
    case 'failed':  return 'status status-failed'
    case 'pending': return 'status status-pending'
    case 'paused':  return 'status status-paused'
    default:        return 'status status-none'
  }
}

function formatDate(date: Date): string {
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
