import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockChannelsFetch = vi.fn().mockResolvedValue({ send: mockSend })
const mockClient = {
  channels: { fetch: mockChannelsFetch },
}

vi.mock('./client', () => ({
  getDiscordClient: vi.fn(() => mockClient),
  waitForReady: vi.fn().mockResolvedValue(undefined),
}))

import {
  sendBuildStartedNotification,
  sendSuccessNotification,
  sendFailureNotification,
  sendConflictNotification,
} from './notifications'
import type { PublicRepo } from '@/src/db/queries/repos'
import type { Commit } from '@/src/git/repo-sync'
import type { StoredArtifact } from '@/src/builder/artifacts'

const mockRepo: PublicRepo = {
  id: 'test-repo-id',
  name: 'TestMod',
  gitUrl: 'https://github.com/user/testmod',
  mode: 'upstream',
  branch: 'main',
  detectionMethod: 'polling',
  pollingIntervalMs: null,
  discordChannelId: '123456789',
  customBuildTask: null,
  jdkVersion: '21',
  notifyOnBuildStart: false,
  sshPublicKey: null,
  upstreamUrl: null,
  syncPaused: false,
  lastCommitHash: null,
  lastBuildStatus: null,
  lastBuildAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockCommits: Commit[] = [
  { hash: 'abc1234567890', author: 'Dev', message: 'Add feature', date: new Date() },
  { hash: 'def1234567890', author: 'Dev', message: 'Fix bug', date: new Date() },
]

describe('sendBuildStartedNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends an embed with repository, branch, task, and commits', async () => {
    await sendBuildStartedNotification('channel-123', mockRepo, mockCommits, 'build')

    expect(mockChannelsFetch).toHaveBeenCalledWith('channel-123')
    expect(mockSend).toHaveBeenCalledTimes(1)

    const embed = mockSend.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toBe('Build started: TestMod')
    expect(embed.data.color).toBe(0x3b82f6)
    expect(embed.data.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Repository', value: mockRepo.gitUrl }),
      expect.objectContaining({ name: 'Branch', value: mockRepo.branch }),
      expect.objectContaining({ name: 'Task', value: 'build' }),
      expect.objectContaining({ name: 'Commits' }),
    ]))
  })
})

describe('sendSuccessNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends embed with repo name, gitUrl, branch, and all commits', async () => {
    const mockArtifacts: StoredArtifact[] = [
      { filename: 'mod.jar', path: '/path/to/mod.jar', size: 1000 },
    ]

    await sendSuccessNotification({
      channelId: 'channel-123',
      repo: mockRepo,
      commits: mockCommits,
      artifacts: mockArtifacts,
      baseUrl: 'http://localhost:3000',
    })

    expect(mockChannelsFetch).toHaveBeenCalledWith('channel-123')
    expect(mockSend).toHaveBeenCalledTimes(1)

    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.embeds).toHaveLength(1)
    
    const embed = callArg.embeds[0]
    expect(embed.data.title).toContain('TestMod')
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.value === 'https://github.com/user/testmod')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.value === 'main')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.value.includes('abc1234'))).toBe(true)
  })

  it('includes download links for artifacts', async () => {
    const mockArtifacts: StoredArtifact[] = [
      { filename: 'TestMod-1.0.jar', path: '/path/to/TestMod-1.0.jar', size: 5 * 1024 * 1024 },
    ]

    await sendSuccessNotification({
      channelId: 'channel-123',
      repo: mockRepo,
      commits: [],
      artifacts: mockArtifacts,
      baseUrl: 'http://localhost:3000',
    })

    const callArg = mockSend.mock.calls[0][0]
    const embed = callArg.embeds[0]
    const downloadsField = embed.data.fields.find((f: { name: string }) => f.name === 'Downloads')
    expect(downloadsField).toBeDefined()
    expect(downloadsField.value).toContain('View 1 artifact')
    expect(downloadsField.value).toContain('http://localhost:3000/repos/test-repo-id/artifacts')
    expect(downloadsField.value).toContain('5.0 MB')
  })
})

describe('sendFailureNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends embed with logTail as code block', async () => {
    const logTail = 'BUILD FAILED\nError: compilation failed'

    await sendFailureNotification('channel-123', mockRepo, mockCommits, logTail)

    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.embeds).toHaveLength(1)
    
    const embed = callArg.embeds[0]
    expect(embed.data.title).toContain('failed')
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.value.includes('BUILD FAILED'))).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.value.includes('```'))).toBe(true)
  })
})

describe('sendConflictNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends embed with fork, upstream, commit range, and conflicting files', async () => {
    const forkRepo: PublicRepo = {
      ...mockRepo,
      mode: 'fork',
      upstreamUrl: 'https://github.com/original/mod',
    }

    await sendConflictNotification(
      'channel-123',
      forkRepo,
      'https://github.com/original/mod',
      'abc1234..def5678',
      ['src/main.ts', 'package.json']
    )

    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.embeds).toHaveLength(1)

    const embed = callArg.embeds[0]
    expect(embed.data.title).toContain('Merge conflict')
    expect(embed.data.title).toContain('TestMod')
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.name === 'Fork')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.name === 'Upstream')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.name === 'Commit range')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.name === 'Conflicting files')).toBe(true)
    expect(embed.data.fields.some((f: { name: string; value: string }) => f.name === 'Action required')).toBe(true)
  })

  it('truncates large file lists', async () => {
    const manyFiles = Array.from({ length: 20 }, (_, i) => `file${i}.ts`)

    await sendConflictNotification(
      'channel-123',
      mockRepo,
      'https://github.com/original/mod',
      'abc..def',
      manyFiles
    )

    const callArg = mockSend.mock.calls[0][0]
    const embed = callArg.embeds[0]
    const filesField = embed.data.fields.find((f: { name: string }) => f.name === 'Conflicting files')
    expect(filesField.value).toContain('... and 5 more')
  })
})
