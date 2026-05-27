import { writeFile, unlink, chmod } from 'node:fs/promises'
import { join } from 'node:path'

export async function storeSshKey(
  repoId: string,
  keyContent: string,
  keysDir: string
): Promise<string> {
  const keyPath = join(keysDir, `repo-${repoId}.pem`)

  await writeFile(keyPath, keyContent, { encoding: 'utf-8', mode: 0o600 })
  await chmod(keyPath, 0o600)

  return keyPath
}

export async function removeSshKey(keyPath: string): Promise<void> {
  try {
    await unlink(keyPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }
}
