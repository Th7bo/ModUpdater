import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile, stat, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, platform } from 'node:os'

import { storeSshKey, removeSshKey } from './ssh-keys'

const isWindows = platform() === 'win32'

describe('ssh-keys', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `ssh-keys-test-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('storeSshKey', () => {
    it('creates the file at the expected path with the provided content', async () => {
      const keyContent = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----'

      const keyPath = await storeSshKey('test-repo-id', keyContent, testDir)

      expect(keyPath).toBe(join(testDir, 'repo-test-repo-id.pem'))
      const content = await readFile(keyPath, 'utf-8')
      expect(content).toBe(keyContent)
    })

    it.skipIf(isWindows)('writes the file with mode 0o600', async () => {
      const keyContent = 'test-key'

      const keyPath = await storeSshKey('test-repo-id', keyContent, testDir)

      const stats = await stat(keyPath)
      const mode = stats.mode & 0o777
      expect(mode).toBe(0o600)
    })

    it('overwrites the existing file when called twice for the same repoId', async () => {
      const firstContent = 'first-key'
      const secondContent = 'second-key'

      await storeSshKey('same-repo', firstContent, testDir)
      const keyPath = await storeSshKey('same-repo', secondContent, testDir)

      const content = await readFile(keyPath, 'utf-8')
      expect(content).toBe(secondContent)
    })

    it.skipIf(isWindows)('maintains mode 0o600 after overwrite', async () => {
      const firstContent = 'first-key'
      const secondContent = 'second-key'

      await storeSshKey('same-repo', firstContent, testDir)
      const keyPath = await storeSshKey('same-repo', secondContent, testDir)

      const stats = await stat(keyPath)
      const mode = stats.mode & 0o777
      expect(mode).toBe(0o600)
    })
  })

  describe('removeSshKey', () => {
    it('deletes the file and does not throw for non-existent path', async () => {
      const keyContent = 'test-key'
      const keyPath = await storeSshKey('to-delete', keyContent, testDir)

      await removeSshKey(keyPath)

      await expect(stat(keyPath)).rejects.toThrow()

      await expect(removeSshKey(keyPath)).resolves.not.toThrow()
    })
  })
})
