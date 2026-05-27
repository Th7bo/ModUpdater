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

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

import { stat } from 'node:fs/promises'

import { sendSuccessNotification, sendFailureNotification } from './notifications'
import type { PublicRepo } from '@/src/db/queries/repos'
import type { Commit } from '@/src/git/repo-sync'

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

describe('sendSuccessNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends embed with repo name, gitUrl, branch, and all commits', async () => {
    vi.mocked(stat).mockResolvedValue({ size: 1000 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)

    await sendSuccessNotification('channel-123', mockRepo, mockCommits, ['/path/to/mod.jar'])

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

  it('attaches artifacts within 25 MB size limit', async () => {
    vi.mocked(stat).mockResolvedValue({ size: 1000 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)

    await sendSuccessNotification('channel-123', mockRepo, [], ['/path/to/small.jar'])

    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.files).toHaveLength(1)
  })

  it('excludes artifacts over 25 MB and mentions them in embed', async () => {
    vi.mocked(stat).mockResolvedValue({ size: 30 * 1024 * 1024 } as ReturnType<typeof stat> extends Promise<infer T> ? T : never)

    await sendSuccessNotification('channel-123', mockRepo, [], ['/path/to/huge.jar'])

    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.files).toHaveLength(0)
    expect(callArg.embeds[0].data.fields.some((f: { name: string; value: string }) => f.name === 'Large files (not attached)')).toBe(true)
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
