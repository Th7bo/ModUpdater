import { NextRequest, NextResponse } from 'next/server'

import { isAuthorized } from '@/src/api/client-auth'
import { parseConfig } from '@/src/config/env'
import { db } from '@/src/db/client'
import { changelogSince } from '@/src/db/queries/changelog'

/**
 * What changed between an installed JAR and the newest build (REQUIREMENTS §12.3).
 *
 * The manifest carries only the newest build's commit, which is misleading when
 * somebody is several builds behind. The installed SHA-256 identifies which
 * build they are on, so the whole range can be answered from build history
 * without the client tracking build ids.
 *
 *   GET /api/changelog?modId=skyhanni&fromSha=<sha256>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = parseConfig()

  if (!config.CLIENT_API_TOKEN) {
    return NextResponse.json({ error: 'Changelog endpoint is not configured' }, { status: 503 })
  }

  if (!isAuthorized(request.headers.get('authorization'), config.CLIENT_API_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const modId = request.nextUrl.searchParams.get('modId')
  const fromSha = request.nextUrl.searchParams.get('fromSha')

  if (!modId || !fromSha) {
    return NextResponse.json({ error: 'modId and fromSha are required' }, { status: 400 })
  }

  const changelog = await changelogSince(db, modId, fromSha)

  return NextResponse.json({
    modId,
    baseKnown: changelog.baseKnown,
    builds: changelog.builds.map((build) => ({
      buildId: build.buildId,
      builtAt: build.builtAt.toISOString(),
      commits: build.commits,
    })),
    commitCount: changelog.builds.reduce((total, build) => total + build.commits.length, 0),
  })
}
