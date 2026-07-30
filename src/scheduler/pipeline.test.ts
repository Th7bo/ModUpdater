import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRepo = vi.fn()
const mockUpdateRepo = vi.fn()
const mockCreateBuildRun = vi.fn()
const mockListBuildRuns = vi.fn()
const mockTryAcquireBuildLock = vi.fn()
const mockEnsureCloned = vi.fn()
const mockFetchLatest = vi.fn()
const mockGetHeadHash = vi.fn()
const mockGetNewCommits = vi.fn()
const mockDetectStonecutter = vi.fn()
const mockSelectBuildTask = vi.fn()
const mockRunBuild = vi.fn()
const mockCollectArtifacts = vi.fn()
const mockFilterDismissedArtifacts = vi.fn((paths: string[], _patterns?: string) => paths)
const mockStoreArtifacts = vi.fn()
const mockSendBuildStartedNotification = vi.fn()
const mockSendSuccessNotification = vi.fn()
const mockSendFailureNotification = vi.fn()
const mockToPublicRepo = vi.fn((repo) => repo)
const mockEnqueueBuild = vi.fn((job) => job())

vi.mock('@/src/config/env', () => ({
  parseConfig: vi.fn(() => ({
    REPOS_DIR: './data/repos',
    LOG_DIR: './data/logs',
    ARTIFACTS_DIR: './data/artifacts',
    BASE_URL: 'http://localhost:3000',
    DEBOUNCE_MS: 60000,
    BUILD_CONCURRENCY: 2,
  })),
}))

vi.mock('@/src/logging/activity-log', () => ({
  createLogFile: vi.fn().mockResolvedValue({ path: '/mock/log/path.log', repoId: 'test', type: 'build' }),
  finalizeLog: vi.fn().mockResolvedValue('/mock/log/path.log'),
  getRelativeLogPath: vi.fn().mockReturnValue('test/build-mock.log'),
}))

vi.mock('@/src/db/client', () => ({
  db: {},
  pool: {},
}))
vi.mock('@/src/db/build-lock', () => ({
  tryAcquireBuildLock: (...args: unknown[]) => mockTryAcquireBuildLock(...args),
}))

vi.mock('@/src/db/queries/repos', () => ({
  getRepo: (...args: unknown[]) => mockGetRepo(...args),
  updateRepo: (...args: unknown[]) => mockUpdateRepo(...args),
  toPublicRepo: (repo: unknown) => mockToPublicRepo(repo),
}))

vi.mock('@/src/db/queries/build-runs', () => ({
  createBuildRun: (...args: unknown[]) => mockCreateBuildRun(...args),
  listBuildRuns: (...args: unknown[]) => mockListBuildRuns(...args),
}))

vi.mock('@/src/git/repo-sync', () => ({
  ensureCloned: (...args: unknown[]) => mockEnsureCloned(...args),
  fetchLatest: (...args: unknown[]) => mockFetchLatest(...args),
  getHeadHash: (...args: unknown[]) => mockGetHeadHash(...args),
  getNewCommits: (...args: unknown[]) => mockGetNewCommits(...args),
}))

vi.mock('@/src/builder/stonecutter', () => ({
  detectStonecutter: (...args: unknown[]) => mockDetectStonecutter(...args),
  selectBuildTask: (...args: unknown[]) => mockSelectBuildTask(...args),
}))

vi.mock('@/src/builder/runner', () => ({
  runBuild: (...args: unknown[]) => mockRunBuild(...args),
}))

vi.mock('@/src/builder/artifacts', () => ({
  collectArtifacts: (...args: unknown[]) => mockCollectArtifacts(...args),
  filterDismissedArtifacts: (paths: string[], patterns: string) =>
    mockFilterDismissedArtifacts(paths, patterns),
  storeArtifacts: (...args: unknown[]) => mockStoreArtifacts(...args),
}))

vi.mock('@/src/discord/notifications', () => ({
  sendBuildStartedNotification: (...args: unknown[]) => mockSendBuildStartedNotification(...args),
  sendSuccessNotification: (...args: unknown[]) => mockSendSuccessNotification(...args),
  sendFailureNotification: (...args: unknown[]) => mockSendFailureNotification(...args),
}))

vi.mock('./build-queue', () => ({
  enqueueBuild: (job: () => Promise<void>) => mockEnqueueBuild(job),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import { triggerBuild } from './pipeline'

const baseRepo = {
  id: 'test-repo-id',
  name: 'TestMod',
  gitUrl: 'https://github.com/user/testmod',
  mode: 'upstream',
  branch: 'main',
  detectionMethod: 'polling',
  discordChannelId: '123456789',
  customBuildTask: null,
  notifyOnBuildStart: false,
  artifactExcludePatterns: '',
  sshPrivateKeyPath: null,
  syncPaused: false,
  lastCommitHash: 'old-hash',
  lastBuildStatus: null,
  lastBuildAt: null,
}

const mockCommits = [
  { hash: 'new-hash', author: 'Dev', message: 'Add feature', date: new Date() },
]

const mockStoredArtifacts = [
  { filename: 'mod.jar', path: '/data/artifacts/build-123/mod.jar', size: 1000 },
]

describe('triggerBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRepo.mockResolvedValue({ ...baseRepo })
    mockGetHeadHash.mockResolvedValue('new-hash')
    mockGetNewCommits.mockResolvedValue(mockCommits)
    mockDetectStonecutter.mockResolvedValue(false)
    mockSelectBuildTask.mockReturnValue('build')
    mockRunBuild.mockResolvedValue({ success: true, logTail: 'BUILD SUCCESSFUL', durationMs: 5000 })
    mockCollectArtifacts.mockResolvedValue(['/path/to/mod.jar'])
    mockFilterDismissedArtifacts.mockImplementation((paths: string[]) => paths)
    mockStoreArtifacts.mockResolvedValue(mockStoredArtifacts)
    mockSendBuildStartedNotification.mockResolvedValue(undefined)
    mockSendSuccessNotification.mockResolvedValue(undefined)
    mockSendFailureNotification.mockResolvedValue(undefined)
    mockCreateBuildRun.mockResolvedValue({})
    mockListBuildRuns.mockResolvedValue([])
    mockTryAcquireBuildLock.mockResolvedValue(vi.fn().mockResolvedValue(undefined))
    mockUpdateRepo.mockResolvedValue({})
  })

  it('happy path (upstream): new commit → build → success notification → persist', async () => {
    await triggerBuild('test-repo-id', 'poll')

    expect(mockEnsureCloned).toHaveBeenCalled()
    expect(mockFetchLatest).toHaveBeenCalled()
    expect(mockRunBuild).toHaveBeenCalled()
    expect(mockStoreArtifacts).toHaveBeenCalled()
    expect(mockSendSuccessNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: '123456789',
        repo: expect.objectContaining({ name: 'TestMod' }),
        commits: mockCommits,
        artifacts: mockStoredArtifacts,
        baseUrl: 'http://localhost:3000',
      })
    )
    expect(mockCreateBuildRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'success' })
    )
    expect(mockUpdateRepo).toHaveBeenCalledWith(
      expect.anything(),
      'test-repo-id',
      expect.objectContaining({ lastBuildStatus: 'success', lastCommitHash: 'new-hash' })
    )
  })

  it('happy path (fork, SSH): uses sshPrivateKeyPath for git operations', async () => {
    mockGetRepo.mockResolvedValue({
      ...baseRepo,
      mode: 'fork',
      sshPrivateKeyPath: '/data/keys/repo-test.pem',
    })

    await triggerBuild('test-repo-id', 'webhook')

    expect(mockEnsureCloned).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '/data/keys/repo-test.pem'
    )
    expect(mockFetchLatest).toHaveBeenCalledWith(
      expect.any(String),
      'main',
      '/data/keys/repo-test.pem'
    )
  })

  it('sends a build-start embed only when enabled', async () => {
    mockGetRepo.mockResolvedValue({
      ...baseRepo,
      notifyOnBuildStart: true,
    })

    await triggerBuild('test-repo-id', 'manual')

    expect(mockSendBuildStartedNotification).toHaveBeenCalledWith(
      '123456789',
      expect.objectContaining({ name: 'TestMod' }),
      mockCommits,
      'build'
    )
    expect(mockSendBuildStartedNotification.mock.invocationCallOrder[0])
      .toBeLessThan(mockRunBuild.mock.invocationCallOrder[0])
  })

  it('does not send a build-start embed when disabled', async () => {
    await triggerBuild('test-repo-id', 'manual')

    expect(mockSendBuildStartedNotification).not.toHaveBeenCalled()
  })

  it('dismisses configured artifacts before storing and notifying', async () => {
    const collected = [
      '/build/Sidequest-26.2-1.0.0.jar',
      '/build/platform-api-1.0.0.jar',
    ]
    const included = ['/build/Sidequest-26.2-1.0.0.jar']
    mockGetRepo.mockResolvedValue({
      ...baseRepo,
      artifactExcludePatterns: 'platform-*.jar',
    })
    mockCollectArtifacts.mockResolvedValue(collected)
    mockFilterDismissedArtifacts.mockReturnValue(included)

    await triggerBuild('test-repo-id', 'manual')

    expect(mockFilterDismissedArtifacts).toHaveBeenCalledWith(
      collected,
      'platform-*.jar'
    )
    expect(mockStoreArtifacts).toHaveBeenCalledWith(
      expect.any(String),
      included,
      './data/artifacts'
    )
  })

  it('idempotency: same hash as lastCommitHash → no build', async () => {
    mockGetHeadHash.mockResolvedValue('old-hash')

    await triggerBuild('test-repo-id', 'poll')

    expect(mockRunBuild).not.toHaveBeenCalled()
    expect(mockSendSuccessNotification).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent triggers for the same repository HEAD', async () => {
    mockGetRepo.mockResolvedValue({
      ...baseRepo,
      notifyOnBuildStart: true,
    })
    let finishBuild!: (result: { success: boolean; logTail: string; durationMs: number }) => void
    mockRunBuild.mockImplementation(() => new Promise((resolve) => {
      finishBuild = resolve
    }))

    const firstTrigger = triggerBuild('test-repo-id', 'sync')

    await vi.waitFor(() => {
      expect(mockRunBuild).toHaveBeenCalledTimes(1)
    })

    const duplicateTrigger = triggerBuild('test-repo-id', 'poll')
    await duplicateTrigger

    expect(mockRunBuild).toHaveBeenCalledTimes(1)
    expect(mockSendBuildStartedNotification).toHaveBeenCalledTimes(1)

    finishBuild({
      success: true,
      logTail: 'BUILD SUCCESSFUL',
      durationMs: 5000,
    })
    await firstTrigger

    expect(mockRunBuild).toHaveBeenCalledTimes(1)
    expect(mockSendBuildStartedNotification).toHaveBeenCalledTimes(1)
    expect(mockSendSuccessNotification).toHaveBeenCalledTimes(1)
  })

  it('skips a duplicate claimed by another server process', async () => {
    mockTryAcquireBuildLock.mockResolvedValue(null)

    await triggerBuild('test-repo-id', 'poll')

    expect(mockTryAcquireBuildLock).toHaveBeenCalledWith({}, 'test-repo-id:new-hash')
    expect(mockRunBuild).not.toHaveBeenCalled()
    expect(mockSendBuildStartedNotification).not.toHaveBeenCalled()
    expect(mockSendSuccessNotification).not.toHaveBeenCalled()
  })

  it('build failure: calls sendFailureNotification and persists failed status', async () => {
    mockRunBuild.mockResolvedValue({ success: false, logTail: 'BUILD FAILED', durationMs: 3000 })

    await triggerBuild('test-repo-id', 'poll')

    expect(mockSendFailureNotification).toHaveBeenCalledWith(
      '123456789',
      expect.objectContaining({ name: 'TestMod' }),
      mockCommits,
      'BUILD FAILED'
    )
    expect(mockCreateBuildRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed' })
    )
    expect(mockUpdateRepo).toHaveBeenCalledWith(
      expect.anything(),
      'test-repo-id',
      expect.objectContaining({ lastBuildStatus: 'failed' })
    )
  })

  it('Discord notification throws: createBuildRun is still called', async () => {
    mockSendSuccessNotification.mockRejectedValue(new Error('Discord error'))

    await triggerBuild('test-repo-id', 'poll')

    expect(mockCreateBuildRun).toHaveBeenCalled()
    expect(mockUpdateRepo).toHaveBeenCalled()
  })
})
