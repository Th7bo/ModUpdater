import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

// Files larger than this are not rendered inline in the viewer; they can still
// be downloaded via the raw file endpoint.
export const MAX_INLINE_BYTES = 512 * 1024

export interface DirEntry {
  name: string
  isDirectory: boolean
  size: number
}

export type RepoFile =
  | { kind: 'directory'; entries: DirEntry[] }
  | { kind: 'text'; content: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }
  | { kind: 'missing' }

/**
 * Absolute path to a repository's cloned working directory.
 */
export function repoRoot(reposDir: string, repoId: string): string {
  return resolve(reposDir, repoId)
}

/**
 * Resolve a user-supplied relative path against the repo root, refusing any
 * path that escapes the root (path traversal) or is otherwise malformed.
 * Returns the absolute target path, or null if the path is not safe.
 */
export function resolveSafePath(root: string, relPath: string): string | null {
  if (relPath.includes('\0')) return null

  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, relPath)
  const rel = relative(resolvedRoot, target)

  if (rel === '') return resolvedRoot
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null

  return target
}

function isProbablyBinary(buffer: Buffer): boolean {
  // A NUL byte in the first chunk is a strong signal of binary content.
  const sample = buffer.subarray(0, 8000)
  return sample.includes(0)
}

async function listDirectory(absDir: string): Promise<DirEntry[]> {
  const dirents = await readdir(absDir, { withFileTypes: true })
  const entries: DirEntry[] = []

  for (const dirent of dirents) {
    const isDirectory = dirent.isDirectory()
    let size = 0
    if (!isDirectory) {
      try {
        size = (await stat(join(absDir, dirent.name))).size
      } catch {
        // Unreadable entry (e.g. broken symlink) — report it with size 0.
      }
    }
    entries.push({ name: dirent.name, isDirectory, size })
  }

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

/**
 * Read a path within a repo, deciding how it should be presented: a directory
 * listing, inline text, a binary/too-large placeholder, or missing.
 */
export async function readRepoPath(
  reposDir: string,
  repoId: string,
  relPath: string
): Promise<RepoFile> {
  const root = repoRoot(reposDir, repoId)
  const target = resolveSafePath(root, relPath)
  if (target === null) return { kind: 'missing' }

  let info
  try {
    info = await stat(target)
  } catch {
    return { kind: 'missing' }
  }

  if (info.isDirectory()) {
    return { kind: 'directory', entries: await listDirectory(target) }
  }

  if (!info.isFile()) return { kind: 'missing' }

  if (info.size > MAX_INLINE_BYTES) {
    return { kind: 'too-large', size: info.size }
  }

  const buffer = await readFile(target)
  if (isProbablyBinary(buffer)) {
    return { kind: 'binary', size: info.size }
  }

  return { kind: 'text', content: buffer.toString('utf-8'), size: info.size }
}
