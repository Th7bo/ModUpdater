import Image from 'next/image'
import { redirect } from 'next/navigation'

import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { listUsers } from '@/src/db/queries/users'
import { RoleSelect } from './_components/role-select'

export default async function UsersPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  const users = await listUsers(db)

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">User Management</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                  <div className="flex items-center gap-2">
                    {user.image && (
                      <Image
                        src={user.image}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-full"
                        unoptimized
                      />
                    )}
                    {user.name || '—'}
                  </div>
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle text-slate-600">
                  {user.email}
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
                  <span
                    className={
                      user.role === 'admin'
                        ? 'px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-800'
                        : 'px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600'
                    }
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-3 py-2.5 border-b border-slate-100 align-middle">
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

      {users.length === 0 && (
        <p className="text-slate-500 text-center py-8">No users found.</p>
      )}
    </>
  )
}
