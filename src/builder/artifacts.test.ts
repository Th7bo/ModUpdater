import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReaddir = vi.fn()
const mockStat = vi.fn()

vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}))

import { collectArtifacts } from './artifacts'

describe('collectArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects JARs from build/libs and excludes -sources.jar and -dev.jar', async () => {
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith('build/libs') || dir.endsWith('build\\libs')) {
        return Promise.resolve([
          'mod-1.0.jar',
          'mod-1.0-sources.jar',
          'mod-1.0-dev.jar',
        ])
      }
      return Promise.resolve([])
    })
    mockStat.mockResolvedValue({ isDirectory: () => false })

    const artifacts = await collectArtifacts('/repos/test')

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toContain('mod-1.0.jar')
    expect(artifacts.some((a) => a.includes('-sources.jar'))).toBe(false)
    expect(artifacts.some((a) => a.includes('-dev.jar'))).toBe(false)
  })

  it('collects JARs from multi-project layout (subproject build/libs)', async () => {
    mockReaddir.mockImplementation((dir: string) => {
      if (dir === '/repos/test') {
        return Promise.resolve(['1.21', '1.20', 'src'])
      }
      if (dir.includes('1.21') && (dir.endsWith('build/libs') || dir.endsWith('build\\libs'))) {
        return Promise.resolve(['mod+1.21.jar'])
      }
      if (dir.includes('1.20') && (dir.endsWith('build/libs') || dir.endsWith('build\\libs'))) {
        return Promise.resolve(['mod+1.20.jar'])
      }
      return Promise.resolve([])
    })
    mockStat.mockImplementation((path: string) => {
      if (path.includes('1.21') || path.includes('1.20')) {
        return Promise.resolve({ isDirectory: () => true })
      }
      if (path.includes('src')) {
        return Promise.resolve({ isDirectory: () => true })
      }
      return Promise.resolve({ isDirectory: () => false })
    })

    const artifacts = await collectArtifacts('/repos/test')

    expect(artifacts).toHaveLength(2)
    expect(artifacts.some((a) => a.includes('mod+1.21.jar'))).toBe(true)
    expect(artifacts.some((a) => a.includes('mod+1.20.jar'))).toBe(true)
  })

  it('returns empty array when no build/libs directories exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'))

    const artifacts = await collectArtifacts('/repos/test')

    expect(artifacts).toEqual([])
  })
})
