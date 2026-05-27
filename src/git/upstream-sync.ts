import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'

import type { Commit } from './repo-sync'

export interface MergeResult {
  success: boolean
  conflicting: boolean
  conflictingFiles?: string[]
}

function createGitInstance(dir: string, sshKeyPath?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: dir,
  }

  if (sshKeyPath) {
    options.config = [
      `core.sshCommand=ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`,
    ]
  }

  return simpleGit(options)
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
  } catch {
    const status = await git.status()

    if (status.conflicted.length > 0) {
      return {
        success: false,
        conflicting: true,
        conflictingFiles: status.conflicted,
      }
    }

    return {
      success: false,
      conflicting: false,
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
  branch: string,
  sshKeyPath?: string
): Promise<void> {
  const git = createGitInstance(dir, sshKeyPath)
  await git.push('origin', branch)
}
