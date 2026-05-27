'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { createRepo, updateRepo, deleteRepo } from '@/src/db/queries/repos'
import { CreateRepoSchema, UpdateRepoSchema } from '@/src/config/repo-schema'

export type ActionState = {
  errors?: Record<string, string[]>
  message?: string
}

function parseFormData(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && value !== '') {
      result[key] = value
    }
  }
  if ('pollingIntervalMs' in result) {
    result.pollingIntervalMs = Number(result.pollingIntervalMs)
  }
  return result
}

export async function createRepoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { message: 'Unauthorized' }

  const parsed = CreateRepoSchema.safeParse(parseFormData(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  await createRepo(db, parsed.data)
  redirect('/repos')
}

export async function updateRepoAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { message: 'Unauthorized' }

  const parsed = UpdateRepoSchema.safeParse(parseFormData(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const repo = await updateRepo(db, id, parsed.data)
  if (!repo) return { message: 'Repository not found' }
  redirect('/repos')
}

export async function deleteRepoAction(id: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  await deleteRepo(db, id)
  redirect('/repos')
}
