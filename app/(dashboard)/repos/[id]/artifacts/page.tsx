import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { listBuildRuns } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'
import { EmptyState, PageHeader, Panel, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

const cfg = parseConfig()

function formatDate(date: Date | null): string {
  if (!date) return 'unknown finish time'
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
    (build) => build.status === 'success' && build.artifactPathsJson
  )
  const artifactCount = successfulBuilds.reduce((count, build) => count + parseArtifacts(build.artifactPathsJson).length, 0)

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Artifacts"
        title={repo.name}
        description="Download the latest generated mod artifacts from successful build runs."
        backHref={`/repos/${id}/edit`}
        backLabel={`Back to ${repo.name}`}
        actions={<Link href={`/repos/${id}/builds`} className="btn btn-secondary">Build history</Link>}
      />

      {successfulBuilds.length === 0 ? (
        <EmptyState
          title="No artifacts available"
          description="Successful builds with recorded artifact paths will appear here for download."
        />
      ) : (
        <Panel title="Recent deliverables" subtitle={`${artifactCount} artifact${artifactCount === 1 ? '' : 's'} across the latest successful builds`}>
          <div className="space-y-5">
            {successfulBuilds.map((build) => {
              const artifacts = parseArtifacts(build.artifactPathsJson)

              return (
                <section key={build.id} className="border-b border-[var(--line)] pb-5 last:border-0 last:pb-0">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="panel-title">Build {build.id.slice(0, 8)}</h2>
                      <p className="panel-subtitle">{formatDate(build.finishedAt)} by {build.triggeredBy}</p>
                    </div>
                    <StatusBadge status="success" />
                  </div>

                  {artifacts.length > 0 ? (
                    <div className="artifact-list">
                      {artifacts.map((artifact, index) => (
                        <div key={`${artifact.path}-${index}`} className="artifact-row">
                          <div className="min-w-0">
                            <div className="cell-code truncate">{artifact.filename}</div>
                            {artifact.size > 0 && <div className="cell-muted text-xs">{formatFileSize(artifact.size)}</div>}
                          </div>
                          <a
                            href={`${cfg.BASE_URL}/api/artifacts/${build.id}/${encodeURIComponent(artifact.filename)}`}
                            className="btn btn-primary btn-sm"
                            download
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="cell-muted text-sm">No artifact entries were recorded for this run.</p>
                  )}
                </section>
              )
            })}
          </div>
        </Panel>
      )}
    </div>
  )
}

function parseArtifacts(raw: string | null): Artifact[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || parsed.length === 0) return []

    if (typeof parsed[0] === 'string') {
      return parsed.map((path: string) => ({
        filename: path.split('/').pop() || path,
        path,
        size: 0,
      }))
    }

    return parsed as Artifact[]
  } catch {
    return []
  }
}
