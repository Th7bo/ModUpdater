'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  repoId: string
}

export function ReenableSyncButton({ repoId }: Props) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  const handleClick = async () => {
    if (pending) return

    setPending(true)
    try {
      const res = await fetch(`/api/repos/${repoId}/reenable-sync`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to re-enable sync')
        return
      }

      router.refresh()
    } catch {
      alert('Network error')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="btn btn-warning btn-sm"
    >
      {pending ? 'Re-enabling...' : 'Resume sync'}
    </button>
  )
}
