import Link from 'next/link'
import { db } from '@/src/db/client'
import { listRepos } from '@/src/db/queries/repos'
import { DeleteButton } from '@/app/(dashboard)/_components/delete-button'
import type { Repo } from '@/src/db/queries/repos'

export default async function ReposPage() {
  const repos = await listRepos(db)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <Link href="/repos/new" className="btn btn-primary">Add repository</Link>
      </div>

      {repos.length === 0 ? (
        <p className="text-slate-500">
          No repositories yet.{' '}
          <Link href="/repos/new" className="text-blue-600 hover:underline">Add one</Link>{' '}
          to get started.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['Name', 'Mode', 'Branch', 'Detection', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600">
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
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">{repo.detectionMethod}</td>
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                  <span className={statusClass(repo.lastBuildStatus)}>
                    {repo.lastBuildStatus ?? 'none'}
                  </span>
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                  <div className="flex gap-2 items-center">
                    <Link href={`/repos/${repo.id}/edit`} className="btn btn-secondary">Edit</Link>
                    <button className="btn btn-secondary" disabled title="Not yet implemented">Build</button>
                    <DeleteButton id={repo.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
