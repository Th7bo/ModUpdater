import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const EXCLUDED_SUFFIXES = ['-sources.jar', '-dev.jar']

function isExcluded(filename: string): boolean {
  return EXCLUDED_SUFFIXES.some((suffix) => filename.endsWith(suffix))
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
