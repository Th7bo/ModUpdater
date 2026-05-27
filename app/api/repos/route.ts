import { NextResponse } from 'next/server'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { listRepos, createRepo, toPublicRepo } from '@/src/db/queries/repos'
import { CreateRepoSchema } from '@/src/config/repo-schema'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const repos = await listRepos(db)
  return NextResponse.json(repos.map(toPublicRepo))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await req.json()
  const parsed = CreateRepoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  const repo = await createRepo(db, parsed.data)
  return NextResponse.json(toPublicRepo(repo), { status: 201 })
}
