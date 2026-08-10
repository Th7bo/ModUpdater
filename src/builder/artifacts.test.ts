import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReaddir = vi.fn()
const mockStat = vi.fn()
const mockHashFile = vi.fn()
const mockReadModMetadata = vi.fn()

vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}))

// hashFile and readModMetadata are covered against real files in
// mod-metadata.test.ts; here we only exercise describeArtifacts' orchestration.
vi.mock('./mod-metadata', () => ({
  hashFile: (...args: unknown[]) => mockHashFile(...args),
  readModMetadata: (...args: unknown[]) => mockReadModMetadata(...args),
}))

import {
  collectArtifacts,
  describeArtifacts,
  filterDismissedArtifacts,
  isArtifactDismissed,
  parseArtifactExcludePatterns,
} from './artifacts'

describe('artifact dismissal patterns', () => {
  it('parses one trimmed pattern per non-empty line', () => {
    expect(parseArtifactExcludePatterns(' platform-*.jar\n\nui-?.jar \r\n')).toEqual([
      'platform-*.jar',
      'ui-?.jar',
    ])
  })

  it('supports exact names, * wildcards, and ? wildcards', () => {
    const patterns = 'platform-*.jar\nui-?.jar\nREADME.jar'

    expect(isArtifactDismissed('platform-api-1.0.0.jar', patterns)).toBe(true)
    expect(isArtifactDismissed('ui-a.jar', patterns)).toBe(true)
    expect(isArtifactDismissed('ui-components.jar', patterns)).toBe(false)
    expect(isArtifactDismissed('README.jar', patterns)).toBe(true)
  })

  it('filters only matching artifact filenames', () => {
    const artifacts = [
      '/build/Sidequest-26.1.2-1.0.0.jar',
      '/build/platform-api-1.0.0.jar',
      '/build/ui-components-1.0.0.jar',
    ]

    expect(filterDismissedArtifacts(artifacts, 'platform-*.jar\nui-*.jar')).toEqual([
      '/build/Sidequest-26.1.2-1.0.0.jar',
    ])
  })
})

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

  it('collects JARs from versions/ subdirectory (Stonecutter layout)', async () => {
    mockReaddir.mockImplementation((dir: string) => {
      if (dir === '/repos/test') {
        return Promise.resolve(['versions', 'src'])
      }
      if (dir.endsWith('versions') || dir.endsWith('versions\\')) {
        return Promise.resolve(['1.21.10', '1.21.11'])
      }
      if (dir.includes('1.21.10') && (dir.endsWith('build/libs') || dir.endsWith('build\\libs'))) {
        return Promise.resolve(['SkyOcean-1.21.10-1.15.2.jar', 'SkyOcean-1.21.10-1.15.2-sources.jar'])
      }
      if (dir.includes('1.21.11') && (dir.endsWith('build/libs') || dir.endsWith('build\\libs'))) {
        return Promise.resolve(['SkyOcean-1.21.11-1.15.2.jar', 'SkyOcean-1.21.11-1.15.2-sources.jar'])
      }
      return Promise.resolve([])
    })
    mockStat.mockImplementation((path: string) => {
      if (path.includes('versions') || path.includes('1.21.10') || path.includes('1.21.11') || path.includes('src')) {
        return Promise.resolve({ isDirectory: () => true })
      }
      return Promise.resolve({ isDirectory: () => false })
    })

    const artifacts = await collectArtifacts('/repos/test')

    expect(artifacts).toHaveLength(2)
    expect(artifacts.some((a) => a.includes('SkyOcean-1.21.10-1.15.2.jar'))).toBe(true)
    expect(artifacts.some((a) => a.includes('SkyOcean-1.21.11-1.15.2.jar'))).toBe(true)
    expect(artifacts.some((a) => a.includes('-sources.jar'))).toBe(false)
  })
})
describe('describeArtifacts', () => {
  const stored = [
    { filename: 'mod-a.jar', path: '/artifacts/build-1/mod-a.jar', size: 1000 },
    { filename: 'mod-b.jar', path: '/artifacts/build-1/mod-b.jar', size: 2000 },
  ]

  const metadata = {
    modId: 'moda',
    modVersion: '1.0.0',
    displayName: 'Mod A',
    mcVersionsRaw: '1.21.4',
    mcVersions: ['1.21.4'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('attaches SHA-256 and metadata to each artifact', async () => {
    mockHashFile.mockResolvedValue('a'.repeat(64))
    mockReadModMetadata.mockResolvedValue(metadata)

    const result = await describeArtifacts(stored)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ ...stored[0], sha256: 'a'.repeat(64), metadata })
  })

  it('keeps artifacts whose metadata cannot be read, with null metadata', async () => {
    mockHashFile.mockResolvedValue('a'.repeat(64))
    mockReadModMetadata.mockResolvedValue(null)

    const result = await describeArtifacts(stored)

    expect(result).toHaveLength(2)
    expect(result.every((a) => a.metadata === null)).toBe(true)
    expect(result.every((a) => a.sha256 === 'a'.repeat(64))).toBe(true)
  })

  it('drops an artifact that cannot be hashed without losing the others', async () => {
    mockHashFile.mockImplementation((path: string) =>
      path.endsWith('mod-a.jar')
        ? Promise.reject(new Error('EACCES'))
        : Promise.resolve('b'.repeat(64))
    )
    mockReadModMetadata.mockResolvedValue(metadata)

    const result = await describeArtifacts(stored)

    expect(result).toHaveLength(1)
    expect(result[0]?.filename).toBe('mod-b.jar')
  })

  it('never throws when every artifact fails', async () => {
    mockHashFile.mockRejectedValue(new Error('disk gone'))

    await expect(describeArtifacts(stored)).resolves.toEqual([])
  })

  it('returns an empty list for no artifacts', async () => {
    await expect(describeArtifacts([])).resolves.toEqual([])
  })
})
