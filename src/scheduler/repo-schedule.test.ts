import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStartPoller = vi.fn()
const mockStopPoller = vi.fn()
const mockStartForkSyncPoller = vi.fn()
const mockStopForkSyncPoller = vi.fn()

vi.mock('./poller', () => ({
  startPoller: (...args: unknown[]) => mockStartPoller(...args),
  stopPoller: (...args: unknown[]) => mockStopPoller(...args),
}))

vi.mock('./fork-sync-poller', () => ({
  startForkSyncPoller: (...args: unknown[]) => mockStartForkSyncPoller(...args),
  stopForkSyncPoller: (...args: unknown[]) => mockStopForkSyncPoller(...args),
}))

import type { Repo } from '@/src/db/queries/repos'
import { scheduleRepo, stopRepoSchedule } from './repo-schedule'

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    name: 'SkyHanni',
    gitUrl: 'git@github.com:Th7bo/SkyHanni.git',
    mode: 'fork',
    branch: 'beta',
    detectionMethod: 'webhook',
    pollingIntervalMs: null,
    discordChannelId: '123',
    customBuildTask: null,
    jdkVersion: '21',
    notifyOnBuildStart: false,
    artifactExcludePatterns: '',
    sshPrivateKeyPath: null,
    sshPublicKey: null,
    webhookSecret: 'secret',
    upstreamUrl: 'https://github.com/hannibal002/SkyHanni.git',
    syncPaused: false,
    lastCommitHash: null,
    lastBuildStatus: null,
    lastBuildAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Repo
}

describe('scheduleRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts the fork sync poller for a fork whose detection is webhook', () => {
    // A webhook registered on the fork never fires for an upstream push, so the
    // fork sync poller is the only thing that sees upstream commits (§4.2.1).
    const repo = makeRepo({ mode: 'fork', detectionMethod: 'webhook' })

    scheduleRepo(repo)

    expect(mockStartForkSyncPoller).toHaveBeenCalledWith(repo)
    expect(mockStartPoller).not.toHaveBeenCalled()
  })

  it('starts both pollers for a fork whose detection is polling', () => {
    const repo = makeRepo({ mode: 'fork', detectionMethod: 'polling' })

    scheduleRepo(repo)

    expect(mockStartPoller).toHaveBeenCalledWith(repo)
    expect(mockStartForkSyncPoller).toHaveBeenCalledWith(repo)
  })

  it('starts only the branch poller for an upstream repo with polling', () => {
    const repo = makeRepo({ mode: 'upstream', detectionMethod: 'polling' })

    scheduleRepo(repo)

    expect(mockStartPoller).toHaveBeenCalledWith(repo)
    expect(mockStartForkSyncPoller).not.toHaveBeenCalled()
  })

  it('starts no pollers for an upstream repo driven by webhook', () => {
    const repo = makeRepo({ mode: 'upstream', detectionMethod: 'webhook' })

    scheduleRepo(repo)

    expect(mockStartPoller).not.toHaveBeenCalled()
    expect(mockStartForkSyncPoller).not.toHaveBeenCalled()
  })

  it('stops existing timers before starting, so a re-schedule does not duplicate', () => {
    const repo = makeRepo()

    scheduleRepo(repo)

    expect(mockStopPoller).toHaveBeenCalledWith('repo-1')
    expect(mockStopForkSyncPoller).toHaveBeenCalledWith('repo-1')
    expect(mockStopForkSyncPoller.mock.invocationCallOrder[0]).toBeLessThan(
      mockStartForkSyncPoller.mock.invocationCallOrder[0]
    )
  })

  it('starts nothing for a paused repo but still clears its timers', () => {
    const repo = makeRepo({ syncPaused: true, detectionMethod: 'polling' })

    scheduleRepo(repo)

    expect(mockStopPoller).toHaveBeenCalledWith('repo-1')
    expect(mockStopForkSyncPoller).toHaveBeenCalledWith('repo-1')
    expect(mockStartPoller).not.toHaveBeenCalled()
    expect(mockStartForkSyncPoller).not.toHaveBeenCalled()
  })

  it('schedules a repo that was paused at boot once it is un-paused', () => {
    const paused = makeRepo({ syncPaused: true })
    scheduleRepo(paused)
    expect(mockStartForkSyncPoller).not.toHaveBeenCalled()

    const resumed = makeRepo({ syncPaused: false })
    scheduleRepo(resumed)
    expect(mockStartForkSyncPoller).toHaveBeenCalledWith(resumed)
  })
})

describe('stopRepoSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stops both pollers for the repo', () => {
    stopRepoSchedule('repo-9')

    expect(mockStopPoller).toHaveBeenCalledWith('repo-9')
    expect(mockStopForkSyncPoller).toHaveBeenCalledWith('repo-9')
  })
})

describe('scheduleRepo error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not throw when a poller fails to start, and still tries the other', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockStartPoller.mockImplementationOnce(() => {
      throw new Error('config missing')
    })
    const repo = makeRepo({ mode: 'fork', detectionMethod: 'polling' })

    expect(() => scheduleRepo(repo)).not.toThrow()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
