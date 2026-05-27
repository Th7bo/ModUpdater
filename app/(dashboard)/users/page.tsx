import Image from 'next/image'
import { redirect } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { listUsers } from '@/src/db/queries/users'
import { RoleSelect } from './_components/role-select'
import { EmptyState, PageHeader, Panel, StatTile, StatusBadge } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function UsersPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  const users = await listUsers(db)
  const admins = users.filter((user) => user.role === 'admin').length

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Access control"
        title="User management"
        description="Review authenticated users and adjust dashboard roles for repository operations."
      />

      <div className="metric-grid">
        <StatTile label="Users" value={users.length} detail="Known authenticated accounts" />
        <StatTile label="Admins" value={admins} detail="Can manage repositories" tone="warning" />
        <StatTile label="Operators" value={users.length - admins} detail="Read and build access" tone="accent" />
        <StatTile label="Current role" value={session.user.role} detail={session.user.email ?? 'Signed in'} tone="success" />
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Users will appear after they authenticate with the configured provider."
        />
      ) : (
        <Panel title="Accounts" subtitle="Role changes apply immediately after selection">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['Name', 'Email', 'Role', 'Change Role'].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Name">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <Image
                            src={user.image}
                            alt=""
                            width={32}
                            height={32}
                            className="rounded-md"
                            unoptimized
                          />
                        ) : (
                          <span className="brand-mark !h-8 !w-8 !text-xs">{initials(user.name || user.email || 'U')}</span>
                        )}
                        <span className="cell-strong">{user.name || 'Unnamed user'}</span>
                      </div>
                    </td>
                    <td className="cell-muted" data-label="Email">{user.email}</td>
                    <td data-label="Role"><StatusBadge status={user.role} /></td>
                    <td className="td-actions">
                      <RoleSelect
                        userId={user.id}
                        currentRole={user.role}
                        isCurrentUser={user.id === session.user.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function initials(value: string): string {
  return value
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
