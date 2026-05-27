import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { LiveLogs } from '@/app/(dashboard)/_components/live-logs'

export default async function LiveLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) notFound()

  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  return (
    <main className="container">
      <div className="mb-6">
        <Link href={`/repos/${id}/edit`} className="text-blue-600 hover:underline text-sm">
          ← Back to {repo.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Live Build Logs: {repo.name}</h1>

      <LiveLogs repoId={id} />
    </main>
  )
}
