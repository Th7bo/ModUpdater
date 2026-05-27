import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/src/auth'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <>
      <nav>
        <Link href="/repos" className="brand">ModUpdater</Link>
        <Link href="/repos">Repos</Link>
        <Link href="/settings">Settings</Link>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <button type="submit" className="btn btn-secondary">Sign out</button>
        </form>
      </nav>
      <main>{children}</main>
    </>
  )
}
