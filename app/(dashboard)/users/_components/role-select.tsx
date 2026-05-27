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
    return <span className="text-xs text-slate-400">Cannot change own role</span>
  }

  return (
    <select
      value={role}
      onChange={(e) => handleChange(e.target.value as 'user' | 'admin')}
      disabled={isPending}
      className="input text-sm py-1 px-2 w-24"
    >
      <option value="user">User</option>
      <option value="admin">Admin</option>
    </select>
  )
}
