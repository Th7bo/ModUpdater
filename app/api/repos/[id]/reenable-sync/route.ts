import { NextResponse } from 'next/server'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo, unpauseRepo } from '@/src/db/queries/repos'
import { createLogFile, appendLog, finalizeLog } from '@/src/logging/activity-log'
import { scheduleRepo } from '@/src/scheduler/repo-schedule'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const repo = await getRepo(db, id)

  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  if (!repo.syncPaused) {
    return NextResponse.json(
      { error: 'Repository sync is not paused' },
      { status: 409 }
    )
  }

  const updated = await unpauseRepo(db, id)
  if (!updated) {
    return NextResponse.json({ error: 'Failed to re-enable sync' }, { status: 500 })
  }

  // startAllPollers skips paused repos, so a repo that was paused at boot has
  // no timers at all — un-pausing has to put them back.
  scheduleRepo(updated)

  try {
    const logHandle = await createLogFile(id, 'sync')
    await appendLog(logHandle, `Sync re-enabled by ${session.user?.email || 'unknown user'}`)
    await finalizeLog(logHandle)
  } catch (err) {
    console.error(`[reenable-sync] Failed to write audit log for ${repo.name}:`, err)
  }

  console.log(`[reenable-sync] Sync re-enabled for repo ${repo.name} by ${session.user?.email}`)

  return NextResponse.json({ message: 'Sync re-enabled' })
}
