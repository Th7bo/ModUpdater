import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/src/auth'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <>
      <nav className="bg-slate-800 text-slate-50 px-6 py-3 flex items-center gap-6">
        <Link href="/repos" className="font-semibold mr-auto text-slate-50">ModUpdater</Link>
        <Link href="/repos" className="text-slate-400 text-sm hover:text-slate-50 transition-colors">Repos</Link>
        <Link href="/settings" className="text-slate-400 text-sm hover:text-slate-50 transition-colors">Settings</Link>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <button type="submit" className="btn btn-secondary text-xs">Sign out</button>
        </form>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </>
  )
}
