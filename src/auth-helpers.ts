import { auth } from '@/src/auth'
import type { UserRole } from '@/src/auth.config'

export async function getSession() {
  return auth()
}

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireRole(minRole: UserRole) {
  const session = await requireAuth()
  const role = session.user.role

  if (minRole === 'admin' && role !== 'admin') {
    throw new Error('Forbidden: Admin access required')
  }

  return session
}

export async function checkRole(minRole: UserRole): Promise<boolean> {
  const session = await auth()
  if (!session?.user) return false

  const role = session.user.role
  if (minRole === 'admin') return role === 'admin'
  if (minRole === 'user') return role === 'user' || role === 'admin'

  return false
}

export async function isAdmin(): Promise<boolean> {
  return checkRole('admin')
}

export async function isUser(): Promise<boolean> {
  return checkRole('user')
}
