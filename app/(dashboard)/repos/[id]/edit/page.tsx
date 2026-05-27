import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { updateRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'
import { CopyButton } from '@/app/(dashboard)/_components/copy-button'

export default async function EditRepoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const action = updateRepoAction.bind(null, id)

  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || 'http'
  const webhookUrl = `${protocol}://${host}/api/webhooks/${repo.id}`

  return (
    <>
      <Link href="/repos" className="text-sm text-blue-600 hover:underline inline-block mb-4">
        ← Back to repos
      </Link>
      <h1 className="text-2xl font-semibold mb-6">Edit {repo.name}</h1>

      {repo.detectionMethod === 'webhook' && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Webhook URL</h2>
          <p className="text-xs text-slate-500 mb-3">
            Add this URL to your GitHub repository&apos;s webhook settings. Set content type to <code className="bg-slate-200 px-1 rounded">application/json</code> and configure the secret below.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-slate-300 rounded px-3 py-2 font-mono text-slate-800 overflow-x-auto">
              {webhookUrl}
            </code>
            <CopyButton text={webhookUrl} />
          </div>
        </div>
      )}

      <RepoForm action={action} defaultValues={repo} submitLabel="Save changes" />
    </>
  )
}
