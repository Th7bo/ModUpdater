import { NextRequest, NextResponse } from 'next/server'
import { stat, readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

import { parseConfig } from '@/src/config/env'

const cfg = parseConfig()

// Public endpoint - no auth required (accessed via Discord embed links)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ buildId: string; filename: string }> }
): Promise<NextResponse> {
  const { buildId, filename } = await params

  if (!buildId || !filename) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  if (buildId.includes('..') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const filePath = normalize(join(cfg.ARTIFACTS_DIR, buildId, filename))

  if (!filePath.startsWith(normalize(cfg.ARTIFACTS_DIR))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    }

    const fileBuffer = await readFile(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/java-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileStat.size.toString(),
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
