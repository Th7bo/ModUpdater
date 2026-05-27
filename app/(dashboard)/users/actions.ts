'use server'

import { revalidatePath } from 'next/cache'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { updateUserRole } from '@/src/db/queries/users'

export async function updateUserRoleAction(
  userId: string,
  role: 'user' | 'admin'
): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  if (userId === session.user.id) {
    return { success: false, error: 'Cannot change your own role' }
  }

  try {
    await updateUserRole(db, userId, role)
    revalidatePath('/users')
    return { success: true }
  } catch (err) {
    console.error('Failed to update user role:', err)
    return { success: false, error: 'Database error' }
  }
}
