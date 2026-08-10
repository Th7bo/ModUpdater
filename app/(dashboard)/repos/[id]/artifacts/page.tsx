import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { listBuildRuns } from '@/src/db/queries/build-runs'
import { listArtifactsByBuild, type Artifact as ArtifactRecord } from '@/src/db/queries/artifacts'
import { parseConfig } from '@/src/config/env'
import { isArtifactDismissed } from '@/src/builder/artifacts'
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
  const artifactCount = successfulBuilds.reduce(
    (count, build) => count + parseArtifacts(build.artifactPathsJson, repo.artifactExcludePatterns).length,
    0
  )

  // Metadata recorded for the client manifest (§12.1), keyed by build then filename.
  const metadataByBuild = new Map<string, Map<string, ArtifactRecord>>(
    await Promise.all(
      successfulBuilds.map(async (build) => {
        const records = await listArtifactsByBuild(db, build.id)
        return [build.id, new Map(records.map((r) => [r.filename, r]))] as const
      })
    )
  )

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
              const artifacts = parseArtifacts(build.artifactPathsJson, repo.artifactExcludePatterns)

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
                      {artifacts.map((artifact, index) => {
                        const record = metadataByBuild.get(build.id)?.get(artifact.filename)

                        return (
                        <div key={`${artifact.path}-${index}`} className="artifact-row">
                          <div className="min-w-0">
                            <div className="cell-code truncate">{artifact.filename}</div>
                            <div className="cell-muted text-xs">
                              {artifact.size > 0 && <span>{formatFileSize(artifact.size)}</span>}
                              {record?.modId ? (
                                <>
                                  {artifact.size > 0 && <span> · </span>}
                                  <span>{record.modId}{record.modVersion ? ` ${record.modVersion}` : ''}</span>
                                  <span> · MC {formatMcVersions(record)}</span>
                                  <span> · {record.sha256.slice(0, 12)}</span>
                                </>
                              ) : (
                                <>
                                  {artifact.size > 0 && <span> · </span>}
                                  <span>
                                    {record
                                      ? 'no fabric.mod.json — not served to clients'
                                      : 'no metadata recorded — run pnpm backfill:artifacts'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <a
                            href={`${cfg.BASE_URL}/api/artifacts/${build.id}/${encodeURIComponent(artifact.filename)}`}
                            className="btn btn-primary btn-sm"
                            download
                          >
                            Download
                          </a>
                        </div>
                        )
                      })}
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

function formatMcVersions(record: ArtifactRecord): string {
  try {
    const parsed: unknown = JSON.parse(record.mcVersionsJson)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.join(', ')
  } catch {
    // fall through to the raw constraint
  }
  // Empty means we couldn't resolve the declared range to concrete versions;
  // clients treat this as unknown compatibility (§12.1).
  return record.mcVersionsRaw ? `${record.mcVersionsRaw} (unresolved)` : 'unknown'
}

function parseArtifacts(raw: string | null, excludePatterns: string): Artifact[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || parsed.length === 0) return []

    if (typeof parsed[0] === 'string') {
      return parsed
        .map((path: string) => ({
          filename: path.split('/').pop() || path,
          path,
          size: 0,
        }))
        .filter((artifact) => !isArtifactDismissed(artifact.filename, excludePatterns))
    }

    return (parsed as Artifact[])
      .filter((artifact) => !isArtifactDismissed(artifact.filename, excludePatterns))
  } catch {
    return []
  }
}
