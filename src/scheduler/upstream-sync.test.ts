import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRepo = vi.fn()
const mockPauseRepo = vi.fn()
const mockEnsureUpstreamRemote = vi.fn()
const mockFetchUpstream = vi.fn()
const mockGetUpstreamOnlyCommits = vi.fn()
const mockSnapshotPreMergeState = vi.fn()
const mockAttemptMerge = vi.fn()
const mockAbortMergeAndRestore = vi.fn()
const mockPushToOrigin = vi.fn()
const mockEnsureCloned = vi.fn()
const mockFetchLatest = vi.fn()
const mockAppendLog = vi.fn()
const mockFinalizeLog = vi.fn()
const mockSendConflictNotification = vi.fn()

vi.mock('@/src/config/env', () => ({
  parseConfig: vi.fn(() => ({ REPOS_DIR: '/data/repos' })),
}))
vi.mock('@/src/db/client', () => ({ db: {} }))
vi.mock('@/src/db/queries/repos', () => ({
  getRepo: (...args: unknown[]) => mockGetRepo(...args),
  pauseRepo: (...args: unknown[]) => mockPauseRepo(...args),
  toPublicRepo: (repo: unknown) => repo,
}))
vi.mock('@/src/git/upstream-sync', () => ({
  ensureUpstreamRemote: (...args: unknown[]) => mockEnsureUpstreamRemote(...args),
  fetchUpstream: (...args: unknown[]) => mockFetchUpstream(...args),
  getUpstreamOnlyCommits: (...args: unknown[]) => mockGetUpstreamOnlyCommits(...args),
  snapshotPreMergeState: (...args: unknown[]) => mockSnapshotPreMergeState(...args),
  attemptMerge: (...args: unknown[]) => mockAttemptMerge(...args),
  abortMergeAndRestore: (...args: unknown[]) => mockAbortMergeAndRestore(...args),
  pushToOrigin: (...args: unknown[]) => mockPushToOrigin(...args),
}))
vi.mock('@/src/git/repo-sync', () => ({
  ensureCloned: (...args: unknown[]) => mockEnsureCloned(...args),
  fetchLatest: (...args: unknown[]) => mockFetchLatest(...args),
}))
vi.mock('@/src/logging/activity-log', () => ({
  createLogFile: vi.fn().mockResolvedValue({ path: '/logs/sync.log' }),
  appendLog: (...args: unknown[]) => mockAppendLog(...args),
  finalizeLog: (...args: unknown[]) => mockFinalizeLog(...args),
}))
vi.mock('@/src/discord/notifications', () => ({
  sendConflictNotification: (...args: unknown[]) => mockSendConflictNotification(...args),
}))
vi.mock('./pipeline', () => ({ triggerBuild: vi.fn() }))
vi.mock('./debouncer', () => ({ debounce: vi.fn() }))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn() }))

import { syncForkUpstream } from './upstream-sync'

const repo = {
  id: 'repo-id',
  name: 'SkyHanni',
  gitUrl: 'git@github.com:Th7bo/SkyHanni.git',
  branch: 'beta',
  mode: 'fork',
  syncPaused: false,
  upstreamUrl: 'https://github.com/hannibal002/SkyHanni.git',
  sshPrivateKeyPath: '/data/keys/repo-id.pem',
  discordChannelId: 'channel-id',
}

describe('syncForkUpstream merge failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue(repo)
    mockGetUpstreamOnlyCommits.mockResolvedValue([
      { hash: '1adc3fe', author: 'Dev', message: 'Update workflow', date: new Date() },
    ])
    mockSnapshotPreMergeState.mockResolvedValue('960537a')
    mockAppendLog.mockResolvedValue(undefined)
    mockFinalizeLog.mockResolvedValue(undefined)
  })

  it('does not pause or send a conflict notification for a non-conflict Git error', async () => {
    mockAttemptMerge.mockResolvedValue({
      success: false,
      conflicting: false,
      error: 'Committer identity unknown',
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await syncForkUpstream(repo.id)

    expect(mockAbortMergeAndRestore).toHaveBeenCalledWith(
      '/data/repos/repo-id',
      '960537a'
    )
    expect(mockPauseRepo).not.toHaveBeenCalled()
    expect(mockSendConflictNotification).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      '[upstream-sync] Error syncing SkyHanni:',
      expect.objectContaining({ message: expect.stringContaining('Committer identity unknown') })
    )
    consoleError.mockRestore()
  })

  it('pauses and notifies only when Git reports conflicted files', async () => {
    mockAttemptMerge.mockResolvedValue({
      success: false,
      conflicting: true,
      conflictingFiles: ['src/conflicted.kt'],
      error: 'Automatic merge failed',
    })

    await syncForkUpstream(repo.id)

    expect(mockPauseRepo).toHaveBeenCalledWith({}, repo.id, 'Merge conflict with upstream')
    expect(mockSendConflictNotification).toHaveBeenCalledWith(
      repo.discordChannelId,
      repo,
      repo.upstreamUrl,
      '1adc3fe',
      ['src/conflicted.kt']
    )
  })
})
