'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  repoId: string
  path: string
  label?: string
  // Where to navigate after a successful delete. Defaults to refreshing in place.
  redirectTo?: string
}

export function FileDeleteButton({ repoId, path, label = 'Delete', redirectTo }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (!confirm(`Delete "${path}"? This permanently removes it from disk and cannot be undone.`)) return

    setPending(true)
    try {
      const res = await fetch(`/api/repos/${repoId}/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete')
        setPending(false)
        return
      }
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    } catch (err) {
      alert('Failed to delete')
      console.error(err)
      setPending(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn btn-danger btn-sm">
      {pending ? 'Deleting...' : label}
    </button>
  )
}
