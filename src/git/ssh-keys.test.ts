import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile, stat, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, platform } from 'node:os'
import { spawnSync } from 'node:child_process'

import { storeSshKey, removeSshKey, generateSshKeyPair } from './ssh-keys'

function hasSshKeygen(): boolean {
  const result = spawnSync('ssh-keygen', ['-V'], { stdio: 'ignore' })
  return (result.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT'
}

const sshKeygenAvailable = hasSshKeygen()

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
    it('deletes private and public key files and does not throw for non-existent paths', async () => {
      const keyContent = 'test-key'
      const keyPath = await storeSshKey('to-delete', keyContent, testDir)
      await writeFile(`${keyPath}.pub`, 'public-key')

      await removeSshKey(keyPath)

      await expect(stat(keyPath)).rejects.toThrow()
      await expect(stat(`${keyPath}.pub`)).rejects.toThrow()

      await expect(removeSshKey(keyPath)).resolves.not.toThrow()
    })
  })

  describe.skipIf(!sshKeygenAvailable)('generateSshKeyPair', () => {
    it('creates a valid key pair and returns the public key', async () => {
      const result = await generateSshKeyPair('gen-test', testDir)

      expect(result.privateKeyPath).toBe(join(testDir, 'repo-gen-test.pem'))
      expect(result.publicKey).toMatch(/^ssh-ed25519 /)
      expect(result.publicKey).toContain('modupdater-repo-gen-test')

      const privateKey = await readFile(result.privateKeyPath, 'utf-8')
      expect(privateKey).toContain('PRIVATE KEY')
    })

    it.skipIf(isWindows)('creates the private key with mode 0o600', async () => {
      const result = await generateSshKeyPair('mode-test', testDir)

      const stats = await stat(result.privateKeyPath)
      const mode = stats.mode & 0o777
      expect(mode).toBe(0o600)
    })

    it('overwrites existing keys when called twice for the same repoId', async () => {
      const result1 = await generateSshKeyPair('overwrite-test', testDir)
      const publicKey1 = result1.publicKey

      const result2 = await generateSshKeyPair('overwrite-test', testDir)
      const publicKey2 = result2.publicKey

      expect(result1.privateKeyPath).toBe(result2.privateKeyPath)
      expect(publicKey1).not.toBe(publicKey2)
    })

    it('creates the keys directory if it does not exist', async () => {
      const nestedDir = join(testDir, 'nested', 'keys')

      const result = await generateSshKeyPair('nested-test', nestedDir)

      expect(result.privateKeyPath).toBe(join(nestedDir, 'repo-nested-test.pem'))
      const privateKey = await readFile(result.privateKeyPath, 'utf-8')
      expect(privateKey).toContain('PRIVATE KEY')
    })
  })
})
