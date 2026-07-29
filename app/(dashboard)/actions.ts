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

// Admin only - create new repo
export async function createRepoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { message: 'Unauthorized' }
  if (session.user.role !== 'admin') return { message: 'Forbidden: Admin access required' }

  const generateOnServer = formData.get('generateSshKey') === 'on'
  const sshPrivateKeyContent = formData.get('sshPrivateKeyContent')
  const parsed = CreateRepoSchema.safeParse(parseFormData(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const repo = await createRepo(db, parsed.data)
  let configuredKeyPath: string | undefined

  try {
    if (generateOnServer) {
      const config = parseConfig()
      const { publicKey, privateKeyPath } = await generateSshKeyPair(repo.id, config.SSH_KEYS_DIR)
      configuredKeyPath = privateKeyPath
      await updateRepo(db, repo.id, {
        sshPrivateKeyPath: privateKeyPath,
        sshPublicKey: publicKey,
      })
    } else if (typeof sshPrivateKeyContent === 'string' && sshPrivateKeyContent) {
      const config = parseConfig()
      const keyPath = await storeSshKey(repo.id, sshPrivateKeyContent, config.SSH_KEYS_DIR)
      configuredKeyPath = keyPath
      await updateRepo(db, repo.id, {
        sshPrivateKeyPath: keyPath,
        sshPublicKey: null,
      })
    }
  } catch (err) {
    if (configuredKeyPath) {
      await removeSshKey(configuredKeyPath)
    }
    await deleteRepo(db, repo.id)
    console.error(`[createRepoAction] Failed to configure SSH key for ${repo.id}:`, err)
    return { message: 'Repository could not be created because its SSH key could not be configured' }
  }

  redirect('/repos')
}

// Admin only - update repo
export async function updateRepoAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth()
  if (!session) return { message: 'Unauthorized' }
  if (session.user.role !== 'admin') return { message: 'Forbidden: Admin access required' }

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
    patch.sshPublicKey = null
  }

  const repo = await updateRepo(db, id, patch)
  if (!repo) return { message: 'Repository not found' }
  redirect('/repos')
}

// Admin only - delete repo
export async function deleteRepoAction(id: string): Promise<void> {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'admin') throw new Error('Forbidden: Admin access required')

  const repo = await getRepo(db, id)
  if (repo?.sshPrivateKeyPath) {
    await removeSshKey(repo.sshPrivateKeyPath)
  }

  await deleteRepo(db, id)
  redirect('/repos')
}

// Admin only - generate SSH key
export async function generateSshKeyAction(
  id: string
): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  const session = await auth()
  if (!session) return { success: false, error: 'Unauthorized' }
  if (session.user.role !== 'admin') return { success: false, error: 'Forbidden: Admin access required' }

  const repo = await getRepo(db, id)
  if (!repo) return { success: false, error: 'Repository not found' }

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
