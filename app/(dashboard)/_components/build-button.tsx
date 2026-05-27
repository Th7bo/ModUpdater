'use client'

import { useState } from 'react'

type Props = {
  repoId: string
}

export function BuildButton({ repoId }: Props) {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    try {
      const res = await fetch(`/api/repos/${repoId}/build`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Build failed to trigger')
      }
    } catch (err) {
      alert('Failed to trigger build')
      console.error(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      className="btn btn-secondary"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? 'Starting...' : 'Build'}
    </button>
  )
}
