import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { getLatestBuildRun } from '@/src/db/queries/build-runs'
import { parseConfig } from '@/src/config/env'

type RouteContext = { params: Promise<{ id: string }> }

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

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  const latestRun = await getLatestBuildRun(db, id)
  if (!latestRun || !latestRun.logPath) {
    return NextResponse.json({ error: 'No logs available' }, { status: 404 })
  }

  const config = parseConfig()
  const fullLogPath = join(config.LOG_DIR, latestRun.logPath)

  if (!isPathWithinLogDir(config.LOG_DIR, fullLogPath)) {
    return NextResponse.json({ error: 'Invalid log path' }, { status: 400 })
  }

  try {
    const content = await readFile(fullLogPath, 'utf-8')
    return NextResponse.json({
      repoId: repo.id,
      repoName: repo.name,
      buildRunId: latestRun.id,
      status: latestRun.status,
      triggeredBy: latestRun.triggeredBy,
      startedAt: latestRun.startedAt,
      finishedAt: latestRun.finishedAt,
      content,
    })
  } catch {
    return NextResponse.json({ error: 'Log file not found' }, { status: 404 })
  }
}
