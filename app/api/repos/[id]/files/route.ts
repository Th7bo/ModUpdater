import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { parseConfig } from '@/src/config/env'
import { deleteRepoPath, repoRoot, resolveSafePath } from '@/src/git/repo-files'

const cfg = parseConfig()

type RouteContext = { params: Promise<{ id: string }> }

// GET: stream a raw file from a repo working tree. Admin only.
export async function GET(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  const relPath = req.nextUrl.searchParams.get('path') ?? ''
  const target = resolveSafePath(repoRoot(cfg.REPOS_DIR, id), relPath)
  if (target === null) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const info = await stat(target)
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    }

    const buffer = await readFile(target)
    const filename = basename(target)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': info.size.toString(),
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}

// DELETE: recursively remove a file or directory from a repo working tree. Admin only.
export async function DELETE(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  const relPath = req.nextUrl.searchParams.get('path') ?? ''
  const result = await deleteRepoPath(cfg.REPOS_DIR, id, relPath)

  if (result === 'invalid') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  if (result === 'missing') {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 })
  }

  console.log(`[files] Admin ${session.user.email ?? session.user.id} deleted ${relPath} in repo ${repo.name} (${id})`)
  return NextResponse.json({ message: 'Deleted' }, { status: 200 })
}
