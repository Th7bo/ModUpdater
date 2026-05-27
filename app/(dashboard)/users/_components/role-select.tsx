'use client'

import { useState, useTransition } from 'react'
import { updateUserRoleAction } from '../actions'

interface RoleSelectProps {
  userId: string
  currentRole: 'user' | 'admin'
  isCurrentUser: boolean
}

export function RoleSelect({ userId, currentRole, isCurrentUser }: RoleSelectProps) {
  const [role, setRole] = useState(currentRole)
  const [isPending, startTransition] = useTransition()

  function handleChange(newRole: 'user' | 'admin') {
    setRole(newRole)
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, newRole)
      if (!result.success) {
        setRole(currentRole)
        alert(result.error || 'Failed to update role')
      }
    })
  }

  if (isCurrentUser) {
    return <span className="cell-muted text-xs">Current account</span>
  }

  return (
    <select
      value={role}
      onChange={(event) => handleChange(event.target.value as 'user' | 'admin')}
      disabled={isPending}
      className="input input-compact max-w-32"
    >
      <option value="user">User</option>
      <option value="admin">Admin</option>
    </select>
  )
}
