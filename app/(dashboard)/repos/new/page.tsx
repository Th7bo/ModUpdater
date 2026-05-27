import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { createRepoAction } from '@/app/(dashboard)/actions'
import { RepoForm } from '@/app/(dashboard)/_components/repo-form'
import { PageHeader } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function NewRepoPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Repository intake"
        title="Add repository"
        description="Connect a Fabric mod project, set the build trigger, and define the runtime channel used for notifications."
        backHref="/repos"
        backLabel="Back to repositories"
      />
      <RepoForm action={createRepoAction} submitLabel="Add repository" />
    </div>
  )
}
