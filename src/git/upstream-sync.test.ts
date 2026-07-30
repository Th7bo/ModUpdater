import { describe, it, expect, vi, beforeEach } from 'vitest'
import simpleGit from 'simple-git'

const mockGitInstance = {
  getRemotes: vi.fn(),
  addRemote: vi.fn(),
  remote: vi.fn(),
  fetch: vi.fn(),
  log: vi.fn(),
  revparse: vi.fn(),
  merge: vi.fn(),
  status: vi.fn(),
  reset: vi.fn(),
  push: vi.fn(),
  listRemote: vi.fn(),
  env: vi.fn().mockReturnThis(),
}

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGitInstance),
}))

import {
  ensureUpstreamRemote,
  fetchUpstream,
  getUpstreamOnlyCommits,
  snapshotPreMergeState,
  attemptMerge,
  abortMergeAndRestore,
  getConflictingFiles,
  pushToOrigin,
} from './upstream-sync'

describe('upstream-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensureUpstreamRemote', () => {
    it('adds upstream remote when not present', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'git@github.com:user/fork.git' } },
      ])

      await ensureUpstreamRemote('/repo', 'git@github.com:owner/upstream.git')

      expect(mockGitInstance.addRemote).toHaveBeenCalledWith(
        'upstream',
        'git@github.com:owner/upstream.git'
      )
    })

    it('updates upstream remote URL if different', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'upstream', refs: { fetch: 'git@github.com:old/upstream.git' } },
      ])

      await ensureUpstreamRemote('/repo', 'git@github.com:new/upstream.git')

      expect(mockGitInstance.remote).toHaveBeenCalledWith([
        'set-url',
        'upstream',
        'git@github.com:new/upstream.git',
      ])
    })

    it('does nothing if upstream remote exists with correct URL', async () => {
      mockGitInstance.getRemotes.mockResolvedValue([
        { name: 'upstream', refs: { fetch: 'git@github.com:owner/upstream.git' } },
      ])

      await ensureUpstreamRemote('/repo', 'git@github.com:owner/upstream.git')

      expect(mockGitInstance.addRemote).not.toHaveBeenCalled()
      expect(mockGitInstance.remote).not.toHaveBeenCalled()
    })
  })

  describe('fetchUpstream', () => {
    it('fetches upstream branch', async () => {
      await fetchUpstream('/repo', 'main')

      expect(mockGitInstance.fetch).toHaveBeenCalledWith('upstream', 'main')
    })
  })

  describe('getUpstreamOnlyCommits', () => {
    it('returns commits from upstream not in origin, oldest first', async () => {
      mockGitInstance.log.mockResolvedValue({
        all: [
          { hash: 'abc123', author: 'Alice', message: 'New feature', date: '2024-01-02T10:00:00Z' },
          { hash: 'def456', author: 'Bob', message: 'Fix bug', date: '2024-01-01T10:00:00Z' },
        ],
      })

      const commits = await getUpstreamOnlyCommits('/repo', 'main')

      expect(commits).toHaveLength(2)
      expect(commits[0].hash).toBe('def456')
      expect(commits[1].hash).toBe('abc123')
    })

    it('returns empty array when no upstream commits', async () => {
      mockGitInstance.log.mockResolvedValue({ all: [] })

      const commits = await getUpstreamOnlyCommits('/repo', 'main')

      expect(commits).toHaveLength(0)
    })

    it('returns empty array on error', async () => {
      mockGitInstance.log.mockRejectedValue(new Error('no commits'))

      const commits = await getUpstreamOnlyCommits('/repo', 'main')

      expect(commits).toHaveLength(0)
    })
  })

  describe('snapshotPreMergeState', () => {
    it('returns current HEAD hash', async () => {
      mockGitInstance.revparse.mockResolvedValue('abc123456789\n')

      const hash = await snapshotPreMergeState('/repo')

      expect(hash).toBe('abc123456789')
    })
  })

  describe('attemptMerge', () => {
    it('configures an identity for automated merge commits', async () => {
      mockGitInstance.merge.mockResolvedValue({})

      await attemptMerge('/repo', 'main')

      expect(vi.mocked(simpleGit)).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.arrayContaining([
            'user.name=ModUpdater',
            'user.email=modupdater@localhost',
          ]),
        })
      )
    })

    it('returns success when merge succeeds', async () => {
      mockGitInstance.merge.mockResolvedValue({})

      const result = await attemptMerge('/repo', 'main')

      expect(result.success).toBe(true)
      expect(result.conflicting).toBe(false)
    })

    it('returns conflicting when merge fails with conflicts', async () => {
      mockGitInstance.merge.mockRejectedValue(new Error('CONFLICT'))
      mockGitInstance.status.mockResolvedValue({
        conflicted: ['file1.ts', 'file2.ts'],
      })

      const result = await attemptMerge('/repo', 'main')

      expect(result.success).toBe(false)
      expect(result.conflicting).toBe(true)
      expect(result.conflictingFiles).toEqual(['file1.ts', 'file2.ts'])
      expect(result.error).toBe('CONFLICT')
    })

    it('returns failure without conflicts on other merge errors', async () => {
      mockGitInstance.merge.mockRejectedValue(new Error('Other error'))
      mockGitInstance.status.mockResolvedValue({
        conflicted: [],
      })

      const result = await attemptMerge('/repo', 'main')

      expect(result.success).toBe(false)
      expect(result.conflicting).toBe(false)
      expect(result.error).toBe('Other error')
    })
  })

  describe('abortMergeAndRestore', () => {
    it('aborts merge and resets to snapshot', async () => {
      await abortMergeAndRestore('/repo', 'abc123')

      expect(mockGitInstance.merge).toHaveBeenCalledWith(['--abort'])
      expect(mockGitInstance.reset).toHaveBeenCalledWith(['--hard', 'abc123'])
    })

    it('continues with reset even if abort fails', async () => {
      mockGitInstance.merge.mockRejectedValue(new Error('No merge in progress'))

      await abortMergeAndRestore('/repo', 'abc123')

      expect(mockGitInstance.reset).toHaveBeenCalledWith(['--hard', 'abc123'])
    })
  })

  describe('getConflictingFiles', () => {
    it('returns list of conflicted files', async () => {
      mockGitInstance.status.mockResolvedValue({
        conflicted: ['src/main.ts', 'package.json'],
      })

      const files = await getConflictingFiles('/repo')

      expect(files).toEqual(['src/main.ts', 'package.json'])
    })
  })

  describe('pushToOrigin', () => {
    it('pushes HEAD to the configured fork URL and verifies the remote SHA', async () => {
      mockGitInstance.revparse.mockResolvedValue('abc123\n')
      mockGitInstance.listRemote.mockResolvedValue('abc123\trefs/heads/main\n')

      const hash = await pushToOrigin(
        '/repo',
        'git@github.com:user/fork.git',
        'main',
        '/keys/repo.pem'
      )

      expect(mockGitInstance.push).toHaveBeenCalledWith(
        'git@github.com:user/fork.git',
        'HEAD:refs/heads/main'
      )
      expect(mockGitInstance.listRemote).toHaveBeenCalledWith([
        'git@github.com:user/fork.git',
        'refs/heads/main',
      ])
      expect(hash).toBe('abc123')
    })

    it('fails when the configured fork does not contain the pushed SHA', async () => {
      mockGitInstance.revparse.mockResolvedValue('local123\n')
      mockGitInstance.listRemote.mockResolvedValue('remote456\trefs/heads/main\n')

      await expect(pushToOrigin(
        '/repo',
        'git@github.com:user/fork.git',
        'main'
      )).rejects.toThrow('Push verification failed')
    })
  })
})
