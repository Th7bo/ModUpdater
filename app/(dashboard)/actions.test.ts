import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/src/auth', () => ({ auth: vi.fn() }))
vi.mock('@/src/db/client', () => ({ db: {} }))
vi.mock('@/src/config/env', () => ({
  parseConfig: vi.fn(() => ({ SSH_KEYS_DIR: '/data/keys' })),
}))
vi.mock('@/src/db/queries/repos', () => ({
  createRepo: vi.fn(),
  updateRepo: vi.fn(),
  deleteRepo: vi.fn(),
  getRepo: vi.fn(),
}))
vi.mock('@/src/git/ssh-keys', () => ({
  generateSshKeyPair: vi.fn(),
  storeSshKey: vi.fn(),
  removeSshKey: vi.fn(),
}))

import { createRepoAction, generateSshKeyAction } from './actions'
import { auth } from '@/src/auth'
import { createRepo, deleteRepo, getRepo, updateRepo } from '@/src/db/queries/repos'
import { generateSshKeyPair, storeSshKey } from '@/src/git/ssh-keys'

const mockSession: Session = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
  expires: new Date(Date.now() + 3_600_000).toISOString(),
}

const repoId = '00000000-0000-0000-0000-000000000001'

function validFormData(): FormData {
  const data = new FormData()
  data.set('name', 'private-mod')
  data.set('gitUrl', 'git@github.com:test/private-mod.git')
  data.set('mode', 'upstream')
  data.set('branch', 'main')
  data.set('detectionMethod', 'polling')
  data.set('discordChannelId', '123456789012345678')
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth as () => Promise<Session | null>).mockResolvedValue(mockSession)
  vi.mocked(createRepo).mockResolvedValue({ id: repoId } as never)
  vi.mocked(updateRepo).mockResolvedValue({ id: repoId } as never)
  vi.mocked(generateSshKeyPair).mockResolvedValue({
    publicKey: 'ssh-ed25519 public-key',
    privateKeyPath: `/data/keys/repo-${repoId}.pem`,
  })
})

describe('createRepoAction SSH setup', () => {
  it('generates and stores a server-managed key when selected', async () => {
    const data = validFormData()
    data.set('generateSshKey', 'on')

    await createRepoAction({}, data)

    expect(generateSshKeyPair).toHaveBeenCalledWith(repoId, '/data/keys')
    expect(updateRepo).toHaveBeenCalledWith({}, repoId, {
      sshPrivateKeyPath: `/data/keys/repo-${repoId}.pem`,
      sshPublicKey: 'ssh-ed25519 public-key',
    })
    expect(storeSshKey).not.toHaveBeenCalled()
  })

  it('stores a manually supplied key during creation', async () => {
    const data = validFormData()
    data.set('sshPrivateKeyContent', 'private-key-content')
    vi.mocked(storeSshKey).mockResolvedValue(`/data/keys/repo-${repoId}.pem`)

    await createRepoAction({}, data)

    expect(storeSshKey).toHaveBeenCalledWith(repoId, 'private-key-content', '/data/keys')
    expect(updateRepo).toHaveBeenCalledWith({}, repoId, {
      sshPrivateKeyPath: `/data/keys/repo-${repoId}.pem`,
      sshPublicKey: null,
    })
  })

  it('rolls back the repository when key generation fails', async () => {
    const data = validFormData()
    data.set('generateSshKey', 'on')
    vi.mocked(generateSshKeyPair).mockRejectedValue(new Error('ssh-keygen unavailable'))

    const result = await createRepoAction({}, data)

    expect(deleteRepo).toHaveBeenCalledWith({}, repoId)
    expect(result.message).toContain('SSH key')
  })
})

describe('generateSshKeyAction', () => {
  it('allows a server-managed key for an upstream private repository', async () => {
    vi.mocked(getRepo).mockResolvedValue({ id: repoId, mode: 'upstream' } as never)

    const result = await generateSshKeyAction(repoId)

    expect(result).toEqual({ success: true, publicKey: 'ssh-ed25519 public-key' })
    expect(generateSshKeyPair).toHaveBeenCalledWith(repoId, '/data/keys')
  })
})
