import { NextResponse } from 'next/server'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { triggerBuild } from '@/src/scheduler'

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

  if (repo.syncPaused) {
    return NextResponse.json(
      { error: 'Repository sync is paused. Re-enable sync before triggering builds.' },
      { status: 409 }
    )
  }

  console.log(`[manual] Build triggered for repo ${repo.name} (${id})`)
  
  triggerBuild(id, 'manual').catch((err) => {
    console.error(`[manual] Build failed for ${repo.name}:`, err)
  })

  return NextResponse.json({ message: 'Build triggered' }, { status: 202 })
}
