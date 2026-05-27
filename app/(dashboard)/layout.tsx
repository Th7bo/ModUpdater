import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/src/auth'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const isAdmin = session.user.role === 'admin'

  return (
    <>
      <nav className="bg-slate-800 text-slate-50 px-6 py-3 flex items-center gap-6">
        <Link href="/repos" className="font-semibold mr-auto text-slate-50">ModUpdater</Link>
        <Link href="/repos" className="text-slate-400 text-sm hover:text-slate-50 transition-colors">Repos</Link>
        {isAdmin && (
          <>
            <Link href="/users" className="text-slate-400 text-sm hover:text-slate-50 transition-colors">Users</Link>
            <Link href="/settings" className="text-slate-400 text-sm hover:text-slate-50 transition-colors">Settings</Link>
          </>
        )}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {session.user.name || session.user.email}
            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase ${
              isAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-600 text-slate-300'
            }`}>
              {session.user.role}
            </span>
          </span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <button type="submit" className="btn btn-secondary text-xs">Sign out</button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </>
  )
}
