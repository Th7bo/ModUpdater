import { mkdir, writeFile, appendFile, readdir, unlink, stat } from 'node:fs/promises'
import { join, resolve, dirname, relative } from 'node:path'

import { parseConfig } from '@/src/config/env'

export interface LogHandle {
  path: string
  repoId: string
  type: 'build' | 'sync'
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function sanitizeRepoId(repoId: string): string {
  if (repoId.includes('..') || repoId.includes('/') || repoId.includes('\\')) {
    return ''
  }
  return repoId.replace(/[^a-zA-Z0-9-]/g, '')
}

function isPathWithinLogDir(logDir: string, targetPath: string): boolean {
  const resolvedLogDir = resolve(logDir)
  const resolvedTarget = resolve(targetPath)
  const relativePath = relative(resolvedLogDir, resolvedTarget)
  return !relativePath.startsWith('..') && !relativePath.startsWith(resolve('/'))
}

export async function createLogFile(
  repoId: string,
  type: 'build' | 'sync'
): Promise<LogHandle> {
  const config = parseConfig()
  const logDir = config.LOG_DIR

  const sanitizedRepoId = sanitizeRepoId(repoId)
  if (!sanitizedRepoId) {
    throw new Error('Invalid repo ID')
  }

  const repoLogDir = join(logDir, sanitizedRepoId)
  await mkdir(repoLogDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${type}-${timestamp}.log`
  const logPath = join(repoLogDir, filename)

  if (!isPathWithinLogDir(logDir, logPath)) {
    throw new Error('Path traversal attempt detected')
  }

  await writeFile(logPath, `[${formatTimestamp()}] Log started for ${type}\n`, 'utf-8')

  return { path: logPath, repoId: sanitizedRepoId, type }
}

export async function appendLog(handle: LogHandle, message: string): Promise<void> {
  const config = parseConfig()
  if (!isPathWithinLogDir(config.LOG_DIR, handle.path)) {
    throw new Error('Path traversal attempt detected')
  }

  const lines = message.split('\n')
  for (const line of lines) {
    if (line.length > 0) {
      await appendFile(handle.path, `[${formatTimestamp()}] ${line}\n`, 'utf-8')
    }
  }
}

export async function finalizeLog(handle: LogHandle): Promise<string> {
  const config = parseConfig()
  if (!isPathWithinLogDir(config.LOG_DIR, handle.path)) {
    throw new Error('Path traversal attempt detected')
  }

  await appendFile(handle.path, `[${formatTimestamp()}] Log finalized\n`, 'utf-8')

  await pruneOldLogs(handle.repoId, 5)

  return handle.path
}

export async function pruneOldLogs(repoId: string, keepCount: number = 5): Promise<void> {
  const config = parseConfig()
  const sanitizedRepoId = sanitizeRepoId(repoId)
  const repoLogDir = join(config.LOG_DIR, sanitizedRepoId)

  if (!isPathWithinLogDir(config.LOG_DIR, repoLogDir)) {
    throw new Error('Path traversal attempt detected')
  }

  let files: string[]
  try {
    files = await readdir(repoLogDir)
  } catch {
    return
  }

  const logFiles = files.filter((f) => f.endsWith('.log'))

  if (logFiles.length <= keepCount) {
    return
  }

  const fileStats = await Promise.all(
    logFiles.map(async (f) => {
      const filePath = join(repoLogDir, f)
      const fileStat = await stat(filePath)
      return { name: f, path: filePath, mtime: fileStat.mtime.getTime() }
    })
  )

  fileStats.sort((a, b) => b.mtime - a.mtime)

  const toDelete = fileStats.slice(keepCount)
  for (const file of toDelete) {
    await unlink(file.path)
  }
}

export async function getLogPath(repoId: string, filename: string): Promise<string | null> {
  const config = parseConfig()
  const sanitizedRepoId = sanitizeRepoId(repoId)
  const logPath = join(config.LOG_DIR, sanitizedRepoId, filename)

  if (!isPathWithinLogDir(config.LOG_DIR, logPath)) {
    return null
  }

  try {
    await stat(logPath)
    return logPath
  } catch {
    return null
  }
}

export function getRelativeLogPath(fullPath: string): string {
  const config = parseConfig()
  return relative(config.LOG_DIR, fullPath)
}
