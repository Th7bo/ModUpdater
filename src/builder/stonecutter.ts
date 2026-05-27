import { access } from 'node:fs/promises'
import { join } from 'node:path'

export async function detectStonecutter(repoDir: string): Promise<boolean> {
  const stonecutterPath = join(repoDir, 'stonecutter.gradle')
  try {
    await access(stonecutterPath)
    return true
  } catch {
    return false
  }
}

export function selectBuildTask(
  hasStonecutter: boolean,
  customTask?: string | null
): string {
  if (customTask) {
    return customTask
  }
  return hasStonecutter ? 'chiseledBuild' : 'build'
}
