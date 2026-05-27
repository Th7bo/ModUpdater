import Link from 'next/link'
import { db } from '@/src/db/client'
import { listRepos } from '@/src/db/queries/repos'
import { DeleteButton } from '@/app/(dashboard)/_components/delete-button'
import type { Repo } from '@/src/db/queries/repos'

export default async function ReposPage() {
  const repos = await listRepos(db)

  return (
    <>
      <div className="page-header">
        <h1>Repositories</h1>
        <Link href="/repos/new" className="btn btn-primary">Add repository</Link>
      </div>

      {repos.length === 0 ? (
        <p>No repositories yet. <Link href="/repos/new">Add one</Link> to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Mode</th>
              <th>Branch</th>
              <th>Detection</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((repo) => (
              <tr key={repo.id}>
                <td>{repo.name}</td>
                <td>{repo.mode}</td>
                <td>{repo.branch}</td>
                <td>{repo.detectionMethod}</td>
                <td>
                  <span className={statusClass(repo.lastBuildStatus)}>
                    {repo.lastBuildStatus ?? 'none'}
                  </span>
                </td>
                <td className="actions">
                  <Link href={`/repos/${repo.id}/edit`} className="btn btn-secondary">Edit</Link>
                  <button className="btn btn-secondary" disabled title="Not yet implemented">
                    Build
                  </button>
                  <DeleteButton id={repo.id} />
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
    case 'failed': return 'status status-failed'
    case 'pending': return 'status status-pending'
    case 'paused': return 'status status-paused'
    default: return 'status status-none'
  }
}
