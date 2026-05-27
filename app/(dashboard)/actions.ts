'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { db } from '@/src/db/client'
import { createRepo, updateRepo, deleteRepo, getRepo } from '@/src/db/queries/repos'
import { CreateRepoSchema, UpdateRepoSchema } from '@/src/config/repo-schema'
import { storeSshKey, removeSshKey, generateSshKeyPair } from '@/src/git/ssh-keys'
import { parseConfig } from '@/src/config/env'

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

  const { sshPrivateKeyContent, ...repoData } = parsed.data
  const patch: Record<string, unknown> = { ...repoData }

  if (sshPrivateKeyContent) {
    const config = parseConfig()
    const keyPath = await storeSshKey(id, sshPrivateKeyContent, config.SSH_KEYS_DIR)
    patch.sshPrivateKeyPath = keyPath
  }

  const repo = await updateRepo(db, id, patch)
  if (!repo) return { message: 'Repository not found' }
  redirect('/repos')
}

export async function deleteRepoAction(id: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  const repo = await getRepo(db, id)
  if (repo?.sshPrivateKeyPath) {
    await removeSshKey(repo.sshPrivateKeyPath)
  }

  await deleteRepo(db, id)
  redirect('/repos')
}

export async function generateSshKeyAction(
  id: string
): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  const session = await auth()
  if (!session) return { success: false, error: 'Unauthorized' }

  const repo = await getRepo(db, id)
  if (!repo) return { success: false, error: 'Repository not found' }

  if (repo.mode !== 'fork') {
    return { success: false, error: 'SSH keys are only needed for fork repos' }
  }

  try {
    const config = parseConfig()
    const { publicKey, privateKeyPath } = await generateSshKeyPair(id, config.SSH_KEYS_DIR)

    await updateRepo(db, id, {
      sshPrivateKeyPath: privateKeyPath,
      sshPublicKey: publicKey,
    })

    return { success: true, publicKey }
  } catch (err) {
    console.error(`[generateSshKeyAction] Failed to generate SSH key for ${id}:`, err)
    return { success: false, error: 'Failed to generate SSH key' }
  }
}
