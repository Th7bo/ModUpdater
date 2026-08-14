import { readdir, stat, mkdir, copyFile, rm } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'

import { readModMetadata, hashFile, type ModMetadata } from './mod-metadata'

const EXCLUDED_SUFFIXES = ['-sources.jar', '-dev.jar']
const EXCLUDED_NAMES = ['buildSrc.jar', 'sharedVariables.jar']
const EXCLUDED_PREFIXES = ['annotation-processors', 'detekt-']

function isExcluded(filename: string): boolean {
  if (EXCLUDED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) return true
  if (EXCLUDED_NAMES.includes(filename)) return true
  if (EXCLUDED_PREFIXES.some((prefix) => filename.startsWith(prefix))) return true
  return false
}

export function parseArtifactExcludePatterns(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

export function isArtifactDismissed(
  filename: string,
  patterns: string | null | undefined
): boolean {
  return parseArtifactExcludePatterns(patterns)
    .some((pattern) => globToRegExp(pattern).test(filename))
}

export function filterDismissedArtifacts(
  paths: string[],
  patterns: string | null | undefined
): string[] {
  return paths.filter((path) => !isArtifactDismissed(basename(path), patterns))
}

async function collectFromDir(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    const jars: string[] = []

    for (const entry of entries) {
      if (entry.endsWith('.jar') && !isExcluded(entry)) {
        jars.push(resolve(dir, entry))
      }
    }

    return jars
  } catch {
    return []
  }
}

async function subdirBuildLibs(baseDir: string): Promise<string[]> {
  const dirs: string[] = []

  try {
    const entries = await readdir(baseDir)

    for (const entry of entries) {
      const entryPath = join(baseDir, entry)
      const entryStat = await stat(entryPath).catch(() => null)

      if (entryStat?.isDirectory()) {
        dirs.push(join(entryPath, 'build', 'libs'))
      }
    }
  } catch {
    // ignore if we can't read baseDir
  }

  return dirs
}

/**
 * Every directory a built JAR can land in: the root project, each subproject,
 * and each Stonecutter version node.
 *
 * Shared by collection and cleaning on purpose. The two must agree — a directory
 * collected but not cleaned is exactly how a stale JAR survives into the next
 * build.
 */
async function artifactDirs(repoDir: string): Promise<string[]> {
  return [
    join(repoDir, 'build', 'libs'),
    ...(await subdirBuildLibs(repoDir)),
    ...(await subdirBuildLibs(join(repoDir, 'versions'))),
  ]
}

/**
 * Empties the JAR output directories before a build (REQUIREMENTS §5).
 *
 * Gradle removes only the outputs it still tracks, so a JAR whose filename
 * changed — which is what a version bump is — is left behind indefinitely. The
 * next build then collects both, and the platform offers the old one as though
 * it were current: SkyOcean shipped 1.17.1 alongside 1.17.2 and the two
 * flip-flopped on every launch.
 *
 * Only `build/libs` goes. Compiled classes, Kotlin's incremental state, Loom's
 * caches and Stonecutter's generated sources all live elsewhere under `build/`,
 * so the next build is still incremental — deleting a tracked output makes
 * Gradle re-run the `jar` task alone.
 *
 * @returns the directories that existed and were removed
 */
export async function cleanArtifactDirs(repoDir: string): Promise<string[]> {
  const removed: string[] = []

  for (const dir of await artifactDirs(repoDir)) {
    try {
      const dirStat = await stat(dir).catch(() => null)
      if (!dirStat?.isDirectory()) continue

      await rm(dir, { recursive: true, force: true })
      removed.push(dir)
    } catch {
      // A directory we cannot clear is not a reason to skip the build; the
      // manifest already keeps only the newest release per Minecraft version.
    }
  }

  return removed
}

function deduplicateArtifacts(paths: string[]): string[] {
  const seen = new Map<string, string>()

  for (const p of paths) {
    const filename = basename(p)
    const nameWithoutExt = filename.replace(/\.jar$/, '')
    const parts = nameWithoutExt.split('-')

    const versionIdx = parts.findIndex((part) => /^\d+\.\d+/.test(part))
    if (versionIdx === -1) {
      seen.set(filename, p)
      continue
    }

    const baseName = parts.slice(0, versionIdx).join('-')
    const versions = parts.slice(versionIdx).sort()
    const key = `${baseName}-${versions.join('-')}`

    if (!seen.has(key)) {
      seen.set(key, p)
    }
  }

  return [...seen.values()]
}

export async function collectArtifacts(repoDir: string): Promise<string[]> {
  const artifacts: string[] = []

  for (const dir of await artifactDirs(repoDir)) {
    artifacts.push(...(await collectFromDir(dir)))
  }

  return deduplicateArtifacts(artifacts)
}

export interface StoredArtifact {
  filename: string
  path: string
  size: number
}

export async function storeArtifacts(
  buildId: string,
  artifactPaths: string[],
  artifactsDir: string
): Promise<StoredArtifact[]> {
  const buildArtifactsDir = join(artifactsDir, buildId)
  await mkdir(buildArtifactsDir, { recursive: true })

  const stored: StoredArtifact[] = []

  for (const srcPath of artifactPaths) {
    const filename = basename(srcPath)
    const destPath = join(buildArtifactsDir, filename)

    await copyFile(srcPath, destPath)
    const fileStat = await stat(destPath)

    stored.push({
      filename,
      path: destPath,
      size: fileStat.size,
    })
  }

  return stored
}

export interface DescribedArtifact extends StoredArtifact {
  sha256: string
  metadata: ModMetadata | null
}

/**
 * Adds SHA-256 and `fabric.mod.json` metadata to stored artifacts, for the
 * client manifest (REQUIREMENTS §12.1).
 *
 * Deliberately separate from `storeArtifacts` so the Discord notification
 * payload and `build_runs.artifact_paths_json` keep their existing shape.
 *
 * Failures are per-artifact and never propagate: an artifact whose hash can't
 * be computed is dropped from the result (it can't form a valid record), and
 * unreadable metadata is simply null. Neither may fail the build.
 */
export async function describeArtifacts(
  stored: StoredArtifact[]
): Promise<DescribedArtifact[]> {
  const described: DescribedArtifact[] = []

  for (const artifact of stored) {
    try {
      const sha256 = await hashFile(artifact.path)
      const metadata = await readModMetadata(artifact.path)
      described.push({ ...artifact, sha256, metadata })
    } catch (err) {
      console.error(`[artifacts] Failed to describe ${artifact.filename}:`, err)
    }
  }

  return described
}

export async function cleanupOldArtifacts(
  buildIdsToDelete: string[],
  artifactsDir: string
): Promise<number> {
  let removedCount = 0

  for (const buildId of buildIdsToDelete) {
    const entryPath = join(artifactsDir, buildId)
    try {
      const entryStat = await stat(entryPath).catch(() => null)
      if (entryStat?.isDirectory()) {
        await rm(entryPath, { recursive: true, force: true })
        removedCount++
      }
    } catch {
      // Ignore errors removing individual folders
    }
  }

  return removedCount
}
