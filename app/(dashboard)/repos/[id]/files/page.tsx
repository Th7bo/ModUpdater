import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { parseConfig } from '@/src/config/env'
import { readRepoPath, type DirEntry } from '@/src/git/repo-files'
import { EmptyState, MetaPill, PageHeader, Panel } from '@/app/(dashboard)/_components/dashboard-ui'
import { FileDeleteButton } from '@/app/(dashboard)/_components/file-delete-button'

const cfg = parseConfig()

function normalizeRelPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw ?? ''
  return value.replace(/^\/+/, '').replace(/\/+$/, '')
}

function childPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function parentPath(relPath: string): string {
  const segments = relPath.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

function filesHref(id: string, relPath: string): string {
  return relPath ? `/repos/${id}/files?path=${encodeURIComponent(relPath)}` : `/repos/${id}/files`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function RepoFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ path?: string | string[] }>
}) {
  const session = await auth()
  if (session?.user.role !== 'admin') notFound()

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const relPath = normalizeRelPath((await searchParams).path)
  const result = await readRepoPath(cfg.REPOS_DIR, id, relPath)

  const segments = relPath.split('/').filter(Boolean)
  const isFileView = result.kind === 'text' || result.kind === 'binary' || result.kind === 'too-large'

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Working tree"
        title={repo.name}
        description="Browse the cloned repository on disk. Visible to admins only."
        backHref="/repos"
        backLabel="Back to repositories"
      />

      <nav className="breadcrumb">
        <Link href={filesHref(id, '')} className="breadcrumb-link">
          {repo.name}
        </Link>
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join('/')
          const isLast = index === segments.length - 1
          return (
            <span key={target} className="breadcrumb-part">
              <span className="breadcrumb-sep">/</span>
              {isLast ? (
                <span className="breadcrumb-current">{segment}</span>
              ) : (
                <Link href={filesHref(id, target)} className="breadcrumb-link">
                  {segment}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      {isFileView && (
        <div className="meta-strip">
          <FileDeleteButton
            repoId={id}
            path={relPath}
            label="Delete this file"
            redirectTo={filesHref(id, parentPath(relPath))}
          />
        </div>
      )}

      {result.kind === 'directory' && (
        <DirectoryView id={id} relPath={relPath} entries={result.entries} />
      )}

      {result.kind === 'text' && <FileView relPath={relPath} content={result.content} size={result.size} />}

      {result.kind === 'binary' && (
        <NonTextNotice
          id={id}
          relPath={relPath}
          title="Binary file"
          description="This file isn't text and can't be displayed inline. Download it to inspect the contents."
          size={result.size}
        />
      )}

      {result.kind === 'too-large' && (
        <NonTextNotice
          id={id}
          relPath={relPath}
          title="File too large to preview"
          description="This file exceeds the inline preview limit. Download it to view the full contents."
          size={result.size}
        />
      )}

      {result.kind === 'missing' && (
        <EmptyState
          title="Path not found"
          description="The file or folder doesn't exist. The repository may not be cloned yet, or the path has changed since this link was created."
        />
      )}
    </div>
  )
}

function DirectoryView({ id, relPath, entries }: { id: string; relPath: string; entries: DirEntry[] }) {
  return (
    <Panel
      title="Directory"
      subtitle={`${entries.length} item${entries.length === 1 ? '' : 's'}`}
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {relPath && (
              <tr>
                <td data-label="Name">
                  <Link href={filesHref(id, parentPath(relPath))} className="file-link">
                    .. (parent directory)
                  </Link>
                </td>
                <td className="cell-muted" data-label="Type">dir</td>
                <td className="cell-muted" data-label="Size">—</td>
                <td className="cell-muted" data-label="Actions">—</td>
              </tr>
            )}
            {entries.length === 0 && !relPath && (
              <tr>
                <td colSpan={4} className="cell-muted">This directory is empty.</td>
              </tr>
            )}
            {entries.map((entry) => {
              const target = childPath(relPath, entry.name)
              return (
                <tr key={entry.name}>
                  <td data-label="Name">
                    <Link href={filesHref(id, target)} className="file-link">
                      {entry.isDirectory ? `${entry.name}/` : entry.name}
                    </Link>
                  </td>
                  <td className="cell-muted" data-label="Type">{entry.isDirectory ? 'dir' : 'file'}</td>
                  <td className="cell-muted" data-label="Size">
                    {entry.isDirectory ? '—' : formatFileSize(entry.size)}
                  </td>
                  <td className="td-actions" data-label="Actions">
                    <FileDeleteButton repoId={id} path={target} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function FileView({ relPath, content, size }: { relPath: string; content: string; size: number }) {
  const name = relPath.split('/').pop() ?? relPath
  const lines = content.split('\n')

  return (
    <section className="console-panel">
      <div className="console-header">
        <span>{name}</span>
        <span>{formatFileSize(size)} · {lines.length} line{lines.length === 1 ? '' : 's'}</span>
      </div>
      <div className="console-body file-view">
        {lines.map((line, index) => (
          <div className="file-line" key={index}>
            <span className="file-lineno">{index + 1}</span>
            <span className="file-linetext">{line === '' ? ' ' : line}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function NonTextNotice({
  id,
  relPath,
  title,
  description,
  size,
}: {
  id: string
  relPath: string
  title: string
  description: string
  size: number
}) {
  return (
    <Panel title={relPath.split('/').pop() ?? relPath}>
      <div className="meta-strip mb-4">
        <MetaPill>{formatFileSize(size)}</MetaPill>
      </div>
      <EmptyState
        title={title}
        description={description}
        action={
          <a
            href={`/api/repos/${id}/files?path=${encodeURIComponent(relPath)}`}
            className="btn btn-primary"
            download
          >
            Download file
          </a>
        }
      />
    </Panel>
  )
}
