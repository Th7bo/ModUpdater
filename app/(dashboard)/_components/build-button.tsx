'use client'

import { useState } from 'react'

type Props = {
  repoId: string
}

type Status = 'idle' | 'pending' | 'triggered' | 'error'

export function BuildButton({ repoId }: Props) {
  const [status, setStatus] = useState<Status>('idle')

  const handleClick = async () => {
    setStatus('pending')
    try {
      const res = await fetch(`/api/repos/${repoId}/build`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
        alert(data.error || 'Build failed to trigger')
        return
      }
      setStatus('triggered')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
      alert('Failed to trigger build')
      console.error(err)
    }
  }

  const buttonText = () => {
    switch (status) {
      case 'pending': return 'Starting...'
      case 'triggered': return 'Triggered'
      case 'error': return 'Failed'
      default: return 'Run build'
    }
  }

  const buttonClass = () => {
    if (status === 'triggered') return 'btn btn-success btn-sm'
    if (status === 'error') return 'btn btn-danger btn-sm'
    return 'btn btn-secondary btn-sm'
  }

  return (
    <button
      className={buttonClass()}
      onClick={handleClick}
      disabled={status === 'pending'}
    >
      {buttonText()}
    </button>
  )
}
