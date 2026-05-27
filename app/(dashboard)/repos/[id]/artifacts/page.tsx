import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { listBuildRuns } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'

const cfg = parseConfig()

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-BE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  }).format(date)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Artifact {
  filename: string
  path: string
  size: number
}

export default async function ArtifactsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) notFound()

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const builds = await listBuildRuns(db, id, 3)
  const successfulBuilds = builds.filter(
    (b) => b.status === 'success' && b.artifactPathsJson
  )

  return (
    <main className="container">
      <div className="mb-6">
        <Link href={`/repos/${id}/edit`} className="text-blue-600 hover:underline text-sm">
          ← Back to {repo.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Artifacts: {repo.name}</h1>

      {successfulBuilds.length === 0 ? (
        <p className="text-gray-500">No successful builds with artifacts yet.</p>
      ) : (
        <div className="space-y-6">
          {successfulBuilds.map((build) => {
            let artifacts: Artifact[] = []
            try {
              const parsed = JSON.parse(build.artifactPathsJson || '[]')
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (typeof parsed[0] === 'string') {
                  artifacts = parsed.map((p: string) => ({
                    filename: p.split('/').pop() || p,
                    path: p,
                    size: 0,
                  }))
                } else {
                  artifacts = parsed
                }
              }
            } catch {
              artifacts = []
            }

            return (
              <div key={build.id} className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="font-semibold">
                      Build {build.id.slice(0, 8)}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {formatDate(build.finishedAt)} • {build.triggeredBy}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
                    Success
                  </span>
                </div>

                {artifacts.length > 0 ? (
                  <ul className="space-y-2">
                    {artifacts.map((artifact, idx) => (
                      <li key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="font-mono text-sm truncate">
                          {artifact.filename}
                        </span>
                        <div className="flex items-center gap-4">
                          {artifact.size > 0 && (
                            <span className="text-xs text-gray-500">
                              {formatFileSize(artifact.size)}
                            </span>
                          )}
                          <a
                            href={`${cfg.BASE_URL}/api/artifacts/${build.id}/${encodeURIComponent(artifact.filename)}`}
                            className="btn btn-sm btn-primary"
                            download
                          >
                            Download
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No artifacts recorded</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
