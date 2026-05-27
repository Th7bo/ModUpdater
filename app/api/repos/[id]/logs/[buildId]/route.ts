import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'

type RouteContext = { params: Promise<{ id: string; buildId: string }> }

function isPathWithinLogDir(logDir: string, targetPath: string): boolean {
  const resolvedLogDir = resolve(logDir)
  const resolvedTarget = resolve(targetPath)
  const relativePath = relative(resolvedLogDir, resolvedTarget)
  return !relativePath.startsWith('..') && !relativePath.startsWith(resolve('/'))
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, buildId } = await params
  const repo = await getRepo(db, id)
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  const build = await getBuildRun(db, buildId)
  if (!build || build.repoId !== id) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  }

  if (!build.logPath) {
    return NextResponse.json({ error: 'No log available' }, { status: 404 })
  }

  const config = parseConfig()
  const fullLogPath = join(config.LOG_DIR, build.logPath)

  if (!isPathWithinLogDir(config.LOG_DIR, fullLogPath)) {
    return NextResponse.json({ error: 'Invalid log path' }, { status: 400 })
  }

  try {
    const content = await readFile(fullLogPath, 'utf-8')
    return NextResponse.json({
      repoId: repo.id,
      repoName: repo.name,
      buildId: build.id,
      status: build.status,
      triggeredBy: build.triggeredBy,
      startedAt: build.startedAt,
      finishedAt: build.finishedAt,
      content,
    })
  } catch {
    return NextResponse.json({ error: 'Log file not found' }, { status: 404 })
  }
}
