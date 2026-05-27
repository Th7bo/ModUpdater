import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { createRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'

export default async function NewRepoPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  return (
    <>
      <Link href="/repos" className="text-sm text-blue-600 hover:underline inline-block mb-4">
        ← Back to repos
      </Link>
      <h1 className="text-2xl font-semibold mb-6">Add repository</h1>
      <RepoForm action={createRepoAction} submitLabel="Add repository" />
    </>
  )
}
