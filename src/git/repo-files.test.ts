import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readRepoPath, repoRoot, resolveSafePath } from './repo-files'

describe('resolveSafePath', () => {
  const root = resolve('/srv/data/repos/abc')

  it('returns the root itself for an empty path', () => {
    expect(resolveSafePath(root, '')).toBe(root)
    expect(resolveSafePath(root, '.')).toBe(root)
  })

  it('resolves nested paths within the root', () => {
    expect(resolveSafePath(root, 'src/main.ts')).toBe(join(root, 'src', 'main.ts'))
  })

  it('rejects parent traversal', () => {
    expect(resolveSafePath(root, '..')).toBeNull()
    expect(resolveSafePath(root, '../keys')).toBeNull()
    expect(resolveSafePath(root, 'src/../../keys')).toBeNull()
    expect(resolveSafePath(root, '../../etc/passwd')).toBeNull()
  })

  it('rejects absolute paths that escape the root', () => {
    expect(resolveSafePath(root, '/etc/passwd')).toBeNull()
  })

  it('rejects paths containing a NUL byte', () => {
    expect(resolveSafePath(root, 'src\0/main.ts')).toBeNull()
  })
})

describe('readRepoPath', () => {
  let reposDir: string
  const repoId = 'repo-1'

  beforeAll(async () => {
    reposDir = await mkdtemp(join(tmpdir(), 'repo-files-'))
    const root = repoRoot(reposDir, repoId)
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'README.md'), '# Hello\n')
    await writeFile(join(root, 'src', 'app.ts'), 'export const x = 1\n')
    await writeFile(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
    // A sibling dir that must never be reachable via traversal.
    await mkdir(join(reposDir, 'keys'), { recursive: true })
    await writeFile(join(reposDir, 'keys', 'id_ed25519'), 'SECRET KEY')
  })

  afterAll(async () => {
    await rm(reposDir, { recursive: true, force: true })
  })

  it('lists a directory with folders sorted before files', async () => {
    const result = await readRepoPath(reposDir, repoId, '')
    expect(result.kind).toBe('directory')
    if (result.kind !== 'directory') return
    expect(result.entries.map((e) => e.name)).toEqual(['src', 'logo.png', 'README.md'])
    expect(result.entries[0].isDirectory).toBe(true)
  })

  it('reads a text file inline', async () => {
    const result = await readRepoPath(reposDir, repoId, 'src/app.ts')
    expect(result).toMatchObject({ kind: 'text', content: 'export const x = 1\n' })
  })

  it('flags binary files instead of returning their bytes', async () => {
    const result = await readRepoPath(reposDir, repoId, 'logo.png')
    expect(result.kind).toBe('binary')
  })

  it('reports missing for a traversal attempt instead of leaking sibling files', async () => {
    const result = await readRepoPath(reposDir, repoId, '../keys/id_ed25519')
    expect(result.kind).toBe('missing')
  })

  it('reports missing for nonexistent paths', async () => {
    const result = await readRepoPath(reposDir, repoId, 'nope.txt')
    expect(result.kind).toBe('missing')
  })
})
