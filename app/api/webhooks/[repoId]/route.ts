import { NextResponse } from 'next/server'

import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { verifySignature } from '@/src/git/webhook-validation'
import { createRateLimiter } from '@/src/scheduler/rate-limiter'

type RouteContext = { params: Promise<{ repoId: string }> }

const rateLimiter = createRateLimiter(60, 60000)

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return 'unknown'
}

export async function POST(req: Request, { params }: RouteContext) {
  const clientIp = getClientIp(req)

  if (!rateLimiter(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }

  const { repoId } = await params
  const rawBody = await req.text()

  const repo = await getRepo(db, repoId)
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  if (!repo.webhookSecret) {
    return NextResponse.json(
      { error: 'Repository has no webhook secret configured' },
      { status: 400 }
    )
  }

  const signature = req.headers.get('x-hub-signature-256')
  if (!verifySignature(repo.webhookSecret, rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // TODO: Replace with real triggerBuild call in Task 9
  console.log(`[webhook] Build triggered for repo ${repo.name} (${repoId})`)

  return NextResponse.json({ message: 'Build queued' }, { status: 202 })
}
