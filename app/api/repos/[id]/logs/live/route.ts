import { NextRequest } from 'next/server'
import { stat, open } from 'node:fs/promises'

import { auth } from '@/src/auth'
import { getActiveBuild } from '@/src/scheduler/build-status'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const activeBuild = getActiveBuild(id)

  if (!activeBuild) {
    return new Response(
      `data: ${JSON.stringify({ type: 'status', status: 'idle' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    )
  }

  const encoder = new TextEncoder()
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null
  let lastSize = 0

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      sendEvent({
        type: 'status',
        status: 'running',
        buildId: activeBuild.buildId,
        repoName: activeBuild.repoName,
        startedAt: activeBuild.startedAt.toISOString(),
      })

      try {
        fileHandle = await open(activeBuild.logPath, 'r')
        
        const poll = async () => {
          try {
            const currentBuild = getActiveBuild(id)
            
            if (!currentBuild || currentBuild.buildId !== activeBuild.buildId) {
              // Build finished - send remaining content and close
              if (fileHandle) {
                const fileStat = await stat(activeBuild.logPath).catch(() => null)
                if (fileStat && fileStat.size > lastSize) {
                  const buffer = Buffer.alloc(fileStat.size - lastSize)
                  await fileHandle.read(buffer, 0, buffer.length, lastSize)
                  sendEvent({ type: 'log', content: buffer.toString('utf-8') })
                }
                await fileHandle.close()
              }
              sendEvent({ type: 'status', status: 'finished' })
              controller.close()
              return
            }

            const fileStat = await stat(activeBuild.logPath).catch(() => null)
            if (fileStat && fileStat.size > lastSize && fileHandle) {
              const buffer = Buffer.alloc(fileStat.size - lastSize)
              await fileHandle.read(buffer, 0, buffer.length, lastSize)
              lastSize = fileStat.size
              sendEvent({ type: 'log', content: buffer.toString('utf-8') })
            }

            setTimeout(poll, 500)
          } catch (err) {
            console.error('[live-logs] Poll error:', err)
            sendEvent({ type: 'error', message: 'Stream error' })
            controller.close()
          }
        }

        poll()
      } catch (err) {
        console.error('[live-logs] Start error:', err)
        sendEvent({ type: 'error', message: 'Failed to open log file' })
        controller.close()
      }
    },
    async cancel() {
      if (fileHandle) {
        await fileHandle.close().catch(() => {})
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
