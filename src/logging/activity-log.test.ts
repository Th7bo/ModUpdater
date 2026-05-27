import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('@/src/config/env', () => ({
  parseConfig: vi.fn(),
}))

import { parseConfig } from '@/src/config/env'
import { createLogFile, appendLog, pruneOldLogs, getLogPath } from './activity-log'

describe('activity-log', () => {
  let testLogDir: string

  beforeEach(async () => {
    testLogDir = join(tmpdir(), `log-test-${Date.now()}`)
    await mkdir(testLogDir, { recursive: true })
    vi.mocked(parseConfig).mockReturnValue({
      LOG_DIR: testLogDir,
    } as ReturnType<typeof parseConfig>)
  })

  afterEach(async () => {
    await rm(testLogDir, { recursive: true, force: true })
  })

  describe('createLogFile', () => {
    it('creates parent directories and log file under configured log directory', async () => {
      const handle = await createLogFile('test-repo-123', 'build')

      expect(handle.path).toContain(testLogDir)
      expect(handle.path).toContain('test-repo-123')
      expect(handle.path).toContain('build-')
      expect(handle.path.endsWith('.log')).toBe(true)

      const content = await readFile(handle.path, 'utf-8')
      expect(content).toContain('Log started for build')
    })

    it('rejects path traversal attempts via repo ID', async () => {
      await expect(createLogFile('../../../etc', 'build')).rejects.toThrow('Invalid repo ID')
      await expect(createLogFile('..', 'build')).rejects.toThrow('Invalid repo ID')
    })
  })

  describe('appendLog', () => {
    it('appends timestamped entries to log file', async () => {
      const handle = await createLogFile('test-repo', 'build')

      await appendLog(handle, 'First line')
      await appendLog(handle, 'Second line')

      const content = await readFile(handle.path, 'utf-8')
      expect(content).toContain('First line')
      expect(content).toContain('Second line')
      expect(content.match(/\[\d{4}-\d{2}-\d{2}/g)?.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('finalizeLog and pruneOldLogs', () => {
    it('prunes logs beyond the 5-per-repo retention limit', async () => {
      const repoId = 'prune-test-repo'
      const repoLogDir = join(testLogDir, repoId)
      await mkdir(repoLogDir, { recursive: true })

      for (let i = 0; i < 7; i++) {
        const logPath = join(repoLogDir, `build-2024-01-0${i + 1}.log`)
        await writeFile(logPath, `Log ${i}`, 'utf-8')
        await new Promise((r) => setTimeout(r, 10))
      }

      const filesBefore = await readdir(repoLogDir)
      expect(filesBefore.length).toBe(7)

      await pruneOldLogs(repoId, 5)

      const filesAfter = await readdir(repoLogDir)
      expect(filesAfter.length).toBe(5)
    })

    it('keeps all logs when count is at or below limit', async () => {
      const repoId = 'keep-test-repo'
      const repoLogDir = join(testLogDir, repoId)
      await mkdir(repoLogDir, { recursive: true })

      for (let i = 0; i < 3; i++) {
        const logPath = join(repoLogDir, `build-2024-01-0${i + 1}.log`)
        await writeFile(logPath, `Log ${i}`, 'utf-8')
      }

      await pruneOldLogs(repoId, 5)

      const files = await readdir(repoLogDir)
      expect(files.length).toBe(3)
    })
  })

  describe('getLogPath', () => {
    it('returns path for existing log file', async () => {
      const handle = await createLogFile('existing-repo', 'build')
      const filename = handle.path.split(/[/\\]/).pop()!

      const result = await getLogPath('existing-repo', filename)

      expect(result).toBe(handle.path)
    })

    it('returns null for non-existent log file', async () => {
      const result = await getLogPath('nonexistent-repo', 'missing.log')
      expect(result).toBeNull()
    })

    it('returns null for path traversal attempts', async () => {
      const result = await getLogPath('repo', '../../../etc/passwd')
      expect(result).toBeNull()
    })
  })
})
