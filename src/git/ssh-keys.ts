import { writeFile, unlink, chmod, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export interface SshKeyPair {
  publicKey: string
  privateKeyPath: string
}

export async function storeSshKey(
  repoId: string,
  keyContent: string,
  keysDir: string
): Promise<string> {
  await mkdir(keysDir, { recursive: true })
  const keyPath = join(keysDir, `repo-${repoId}.pem`)

  await writeFile(keyPath, keyContent, { encoding: 'utf-8', mode: 0o600 })
  await chmod(keyPath, 0o600)

  return keyPath
}

export async function removeSshKey(keyPath: string): Promise<void> {
  for (const path of [keyPath, `${keyPath}.pub`]) {
    try {
      await unlink(path)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }
}

export async function generateSshKeyPair(
  repoId: string,
  keysDir: string
): Promise<SshKeyPair> {
  await mkdir(keysDir, { recursive: true })

  const privateKeyPath = join(keysDir, `repo-${repoId}.pem`)
  const publicKeyPath = `${privateKeyPath}.pub`

  try {
    await unlink(privateKeyPath)
  } catch {
    // file may not exist
  }
  try {
    await unlink(publicKeyPath)
  } catch {
    // file may not exist
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ssh-keygen', [
      '-t', 'ed25519',
      '-f', privateKeyPath,
      '-N', '',
      '-C', `modupdater-repo-${repoId}`,
    ])

    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ssh-keygen: ${err.message}`))
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ssh-keygen failed with code ${code}: ${stderr}`))
      }
    })
  })

  await chmod(privateKeyPath, 0o600)

  const publicKey = await readFile(publicKeyPath, 'utf-8')

  return {
    publicKey: publicKey.trim(),
    privateKeyPath,
  }
}
