import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGitInstance = {
  clone: vi.fn().mockResolvedValue(undefined),
  fetch: vi.fn().mockResolvedValue(undefined),
  revparse: vi.fn().mockResolvedValue('abc123def456'),
  log: vi.fn().mockResolvedValue({
    all: [
      { hash: 'commit2', author: 'Author', message: 'Second commit', date: '2024-01-02T00:00:00Z' },
      { hash: 'commit1', author: 'Author', message: 'First commit', date: '2024-01-01T00:00:00Z' },
    ],
  }),
  env: vi.fn().mockReturnThis(),
}

vi.mock('simple-git', () => {
  return {
    default: vi.fn(() => mockGitInstance),
  }
})

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'node:fs'

import { ensureCloned, getHeadHash, getNewCommits } from './repo-sync'

describe('ensureCloned', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls git.clone when the directory does not contain a git repo', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    await ensureCloned('https://github.com/user/repo.git', '/repos/test', undefined)

    expect(mockGitInstance.clone).toHaveBeenCalledWith('https://github.com/user/repo.git', '/repos/test')
  })

  it('calls git.fetch when the directory already contains a git repo', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    await ensureCloned('https://github.com/user/repo.git', '/repos/test', undefined)

    expect(mockGitInstance.clone).not.toHaveBeenCalled()
    expect(mockGitInstance.fetch).toHaveBeenCalled()
  })
})

describe('getHeadHash', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses and returns the SHA from git.revparse', async () => {
    mockGitInstance.revparse.mockResolvedValue('  abc123def456\n')

    const hash = await getHeadHash('/repos/test', 'main')

    expect(hash).toBe('abc123def456')
    expect(mockGitInstance.revparse).toHaveBeenCalledWith(['origin/main'])
  })
})

describe('getNewCommits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns commits after since in oldest-first order', async () => {
    mockGitInstance.revparse.mockResolvedValue('different-hash')
    mockGitInstance.log.mockResolvedValue({
      all: [
        { hash: 'newer', author: 'Author', message: 'Newer', date: '2024-01-02T00:00:00Z' },
        { hash: 'older', author: 'Author', message: 'Older', date: '2024-01-01T00:00:00Z' },
      ],
    })

    const commits = await getNewCommits('/repos/test', 'old-hash', 'main')

    expect(commits).toHaveLength(2)
    expect(commits[0].hash).toBe('older')
    expect(commits[1].hash).toBe('newer')
  })

  it('returns empty array when since equals HEAD hash (idempotency)', async () => {
    mockGitInstance.revparse.mockResolvedValue('same-hash')

    const commits = await getNewCommits('/repos/test', 'same-hash', 'main')

    expect(commits).toEqual([])
    expect(mockGitInstance.log).not.toHaveBeenCalled()
  })
})
