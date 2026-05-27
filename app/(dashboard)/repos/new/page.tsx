import Link from 'next/link'
import { createRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'

export default function NewRepoPage() {
  return (
    <>
      <Link href="/repos" className="back-link">← Back to repos</Link>
      <h1>Add repository</h1>
      <RepoForm action={createRepoAction} submitLabel="Add repository" />
    </>
  )
}
