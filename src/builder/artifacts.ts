import { readdir, stat, mkdir, copyFile, rm } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'

const EXCLUDED_SUFFIXES = ['-sources.jar', '-dev.jar']
const EXCLUDED_NAMES = ['buildSrc.jar', 'sharedVariables.jar']
const EXCLUDED_PREFIXES = ['annotation-processors', 'detekt-']

function isExcluded(filename: string): boolean {
  if (EXCLUDED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) return true
  if (EXCLUDED_NAMES.includes(filename)) return true
  if (EXCLUDED_PREFIXES.some((prefix) => filename.startsWith(prefix))) return true
  return false
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

async function collectFromSubdirs(baseDir: string): Promise<string[]> {
  const artifacts: string[] = []

  try {
    const entries = await readdir(baseDir)

    for (const entry of entries) {
      const entryPath = join(baseDir, entry)
      const entryStat = await stat(entryPath).catch(() => null)

      if (entryStat?.isDirectory()) {
        const subBuildLibs = join(entryPath, 'build', 'libs')
        artifacts.push(...(await collectFromDir(subBuildLibs)))
      }
    }
  } catch {
    // ignore if we can't read baseDir
  }

  return artifacts
}

export async function collectArtifacts(repoDir: string): Promise<string[]> {
  const artifacts: string[] = []

  const mainBuildLibs = join(repoDir, 'build', 'libs')
  artifacts.push(...(await collectFromDir(mainBuildLibs)))

  artifacts.push(...(await collectFromSubdirs(repoDir)))

  const versionsDir = join(repoDir, 'versions')
  artifacts.push(...(await collectFromSubdirs(versionsDir)))

  return artifacts
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
