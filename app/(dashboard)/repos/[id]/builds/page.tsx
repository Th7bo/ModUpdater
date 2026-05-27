import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { listBuildRuns } from '@/src/db/queries/build-runs'

export default async function BuildsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const builds = await listBuildRuns(db, id)

  return (
    <>
      <Link href="/repos" className="text-sm text-blue-600 hover:underline inline-block mb-4">
        ← Back to repos
      </Link>

      <h1 className="text-2xl font-semibold mb-2">Build History: {repo.name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {builds.length} build{builds.length !== 1 ? 's' : ''} recorded
      </p>

      {builds.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <p className="text-slate-500">No builds yet for this repository.</p>
          <p className="text-sm text-slate-400 mt-1">
            Builds are recorded when triggered by polling, webhooks, or manual action.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Status', 'Triggered By', 'Started', 'Duration', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {builds.map((build) => (
                <tr key={build.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                    <span className={build.status === 'success' ? 'status status-success' : 'status status-failed'}>
                      {build.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle text-slate-600">
                    {build.triggeredBy}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle text-slate-600">
                    {build.startedAt.toLocaleString('en-BE', { timeZone: 'Europe/Brussels' })}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle text-slate-600">
                    {build.finishedAt ? formatDuration(build.startedAt, build.finishedAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                    {build.logPath ? (
                      <Link
                        href={`/repos/${id}/builds/${build.id}/log`}
                        className="btn btn-secondary text-xs"
                      >
                        View Log
                      </Link>
                    ) : (
                      <span className="text-slate-400 text-xs">No log</span>
                    )}
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
