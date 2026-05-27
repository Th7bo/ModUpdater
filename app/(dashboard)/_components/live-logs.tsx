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
  const logsEndRef = useRef<HTMLSpanElement>(null)
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
        // Ignore malformed stream chunks.
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
        // Ignore malformed stream chunks.
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

  const statusLabels: Record<Status, string> = {
    idle: 'No active build',
    connecting: 'Connecting',
    running: 'Building',
    finished: 'Build finished',
    error: 'Connection error',
  }

  return (
    <section className="console-panel">
      <div className="console-header">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`status status-${status}`}>{statusLabels[status]}</span>
          {buildInfo.repoName && status === 'running' && (
            <span>Building {buildInfo.repoName}</span>
          )}
        </div>
        <button
          onClick={reconnect}
          className="btn btn-ghost btn-sm"
          disabled={status === 'connecting'}
        >
          Refresh
        </button>
      </div>

      <div className="console-body live-log-body">
        {logs ? (
          <pre className="whitespace-pre-wrap break-words">
            {logs}
            <span ref={logsEndRef} />
          </pre>
        ) : (
          <p style={{ color: 'var(--text-faint)' }}>
            {status === 'idle'
              ? 'No build is currently running. Trigger a build to see live logs.'
              : status === 'connecting'
                ? 'Connecting to log stream...'
                : 'Waiting for output...'}
          </p>
        )}
      </div>
    </section>
  )
}
