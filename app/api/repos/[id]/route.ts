import { NextResponse } from 'next/server'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo, updateRepo, deleteRepo, toPublicRepo } from '@/src/db/queries/repos'
import { UpdateRepoSchema } from '@/src/config/repo-schema'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(toPublicRepo(repo))
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: unknown = await req.json()
  const parsed = UpdateRepoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const repo = await updateRepo(db, id, parsed.data)
  if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(toPublicRepo(repo))
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deleteRepo(db, id)
  return new Response(null, { status: 204 })
}
