import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'

import type { Commit } from './repo-sync'

export interface MergeResult {
  success: boolean
  conflicting: boolean
  conflictingFiles?: string[]
  error?: string
}

function createGitInstance(dir: string, sshKeyPath?: string): SimpleGit {
  const gitConfig = [
    'user.name=ModUpdater',
    'user.email=modupdater@localhost',
  ]

  if (sshKeyPath) {
    gitConfig.push(
      `core.sshCommand=ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`
    )
  }

  const options: Partial<SimpleGitOptions> = {
    baseDir: dir,
    config: gitConfig,
    unsafe: {
      allowUnsafeSshCommand: true,
    },
  }

  return simpleGit(options).env({ GIT_TERMINAL_PROMPT: '0' })
}

export async function ensureUpstreamRemote(
  dir: string,
  upstreamUrl: string,
  sshKeyPath?: string
): Promise<void> {
  const git = createGitInstance(dir, sshKeyPath)

  const remotes = await git.getRemotes(true)
  const upstreamRemote = remotes.find((r) => r.name === 'upstream')

  if (upstreamRemote) {
    if (upstreamRemote.refs.fetch !== upstreamUrl) {
      await git.remote(['set-url', 'upstream', upstreamUrl])
    }
    return
  }

  await git.addRemote('upstream', upstreamUrl)
}

export async function fetchUpstream(
  dir: string,
  branch: string,
  sshKeyPath?: string
): Promise<void> {
  const git = createGitInstance(dir, sshKeyPath)
  await git.fetch('upstream', branch)
}

export async function getUpstreamOnlyCommits(
  dir: string,
  branch: string
): Promise<Commit[]> {
  const git = createGitInstance(dir)

  try {
    const log = await git.log({
      from: `origin/${branch}`,
      to: `upstream/${branch}`,
      format: {
        hash: '%H',
        author: '%an',
        message: '%s',
        date: '%aI',
      },
    })

    return log.all
      .map((entry) => ({
        hash: entry.hash,
        author: entry.author,
        message: entry.message,
        date: new Date(entry.date),
      }))
      .reverse()
  } catch {
    return []
  }
}

export async function snapshotPreMergeState(dir: string): Promise<string> {
  const git = createGitInstance(dir)
  const result = await git.revparse(['HEAD'])
  return result.trim()
}

export async function attemptMerge(
  dir: string,
  branch: string
): Promise<MergeResult> {
  const git = createGitInstance(dir)

  try {
    await git.merge([`upstream/${branch}`, '--no-edit'])

    return {
      success: true,
      conflicting: false,
    }
  } catch (err) {
    const status = await git.status()
    const error = err instanceof Error ? err.message : String(err)

    if (status.conflicted.length > 0) {
      return {
        success: false,
        conflicting: true,
        conflictingFiles: status.conflicted,
        error,
      }
    }

    return {
      success: false,
      conflicting: false,
      error,
    }
  }
}

export async function abortMergeAndRestore(
  dir: string,
  snapshotHash: string
): Promise<void> {
  const git = createGitInstance(dir)

  try {
    await git.merge(['--abort'])
  } catch {
    // merge may not be in progress, continue
  }

  await git.reset(['--hard', snapshotHash])
}

export async function getConflictingFiles(dir: string): Promise<string[]> {
  const git = createGitInstance(dir)
  const status = await git.status()
  return status.conflicted
}

export async function pushToOrigin(
  dir: string,
  originUrl: string,
  branch: string,
  sshKeyPath?: string
): Promise<string> {
  const git = createGitInstance(dir, sshKeyPath)
  const localHash = (await git.revparse(['HEAD'])).trim()

  await git.push(originUrl, `HEAD:refs/heads/${branch}`)

  const remoteRefs = await git.listRemote([
    originUrl,
    `refs/heads/${branch}`,
  ])
  const remoteHash = remoteRefs.trim().split(/\s+/)[0] ?? ''

  if (remoteHash !== localHash) {
    throw new Error(
      `Push verification failed for ${branch}: expected ${localHash}, received ${remoteHash || 'no remote ref'}`
    )
  }

  return remoteHash
}
