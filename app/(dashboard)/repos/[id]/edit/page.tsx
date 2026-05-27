import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/src/db/client'
import { getRepo } from '@/src/db/queries/repos'
import { updateRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'

export default async function EditRepoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const repo = await getRepo(db, id)
  if (!repo) notFound()

  const action = updateRepoAction.bind(null, id)

  return (
    <>
      <Link href="/repos" className="back-link">← Back to repos</Link>
      <h1>Edit {repo.name}</h1>
      <RepoForm action={action} defaultValues={repo} submitLabel="Save changes" />
    </>
  )
}
