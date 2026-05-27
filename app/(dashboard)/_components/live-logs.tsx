'use client'

import { useEffect, useRef, useState } from 'react'

interface LiveLogsProps {
  repoId: string
}

type Status = 'idle' | 'connecting' | 'running' | 'finished' | 'error'

export function LiveLogs({ repoId }: LiveLogsProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [logs, setLogs] = useState('')
  const [buildInfo, setBuildInfo] = useState<{ repoName?: string; startedAt?: string }>({})
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const reconnect = () => {
    eventSourceRef.current?.close()
    setStatus('connecting')
    setLogs('')

    const es = new EventSource(`/api/repos/${repoId}/logs/live`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setStatus(data.status as Status)
          if (data.repoName) {
            setBuildInfo({ repoName: data.repoName, startedAt: data.startedAt })
          }
        } else if (data.type === 'log') {
          setLogs((prev) => prev + data.content)
        } else if (data.type === 'error') {
          setStatus('error')
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setStatus('error')
      es.close()
    }
  }

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setStatus('connecting')
    setLogs('')

    const es = new EventSource(`/api/repos/${repoId}/logs/live`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setStatus(data.status as Status)
          if (data.repoName) {
            setBuildInfo({ repoName: data.repoName, startedAt: data.startedAt })
          }
        } else if (data.type === 'log') {
          setLogs((prev) => prev + data.content)
        } else if (data.type === 'error') {
          setStatus('error')
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setStatus('error')
      es.close()
    }

    return () => {
      es.close()
    }
  }, [repoId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const statusColors: Record<Status, string> = {
    idle: 'bg-gray-100 text-gray-600',
    connecting: 'bg-yellow-100 text-yellow-700',
    running: 'bg-blue-100 text-blue-700',
    finished: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }

  const statusLabels: Record<Status, string> = {
    idle: 'No active build',
    connecting: 'Connecting...',
    running: 'Building...',
    finished: 'Build finished',
    error: 'Connection error',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status]}`}>
            {statusLabels[status]}
          </span>
          {buildInfo.repoName && status === 'running' && (
            <span className="text-sm text-gray-500">
              Building {buildInfo.repoName}
            </span>
          )}
        </div>
        <button
          onClick={reconnect}
          className="btn btn-secondary text-sm"
          disabled={status === 'connecting'}
        >
          Refresh
        </button>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-auto font-mono text-sm">
        {logs ? (
          <pre className="text-gray-100 whitespace-pre-wrap break-words">
            {logs}
            <div ref={logsEndRef} />
          </pre>
        ) : (
          <p className="text-gray-500 italic">
            {status === 'idle'
              ? 'No build is currently running. Trigger a build to see live logs.'
              : status === 'connecting'
              ? 'Connecting to log stream...'
              : 'Waiting for output...'}
          </p>
        )}
      </div>
    </div>
  )
}
