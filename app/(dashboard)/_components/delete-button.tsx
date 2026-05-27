'use client'

import { useTransition } from 'react'
import { deleteRepoAction } from '@/app/(dashboard)/actions'

export function DeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Delete this repository? This action cannot be undone.')) return
    startTransition(async () => {
      await deleteRepoAction(id)
    })
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn btn-danger">
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
