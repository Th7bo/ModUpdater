import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface Commit {
  hash: string
  author: string
  message: string
  date: Date
}

function createGitInstance(dir: string, sshKeyPath?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: dir,
    unsafe: {
      allowUnsafeSshCommand: true,
    },
  }

  if (sshKeyPath) {
    options.config = [
      `core.sshCommand=ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`,
    ]
  }

  return simpleGit(options)
}

export async function ensureCloned(
  gitUrl: string,
  dir: string,
  sshKeyPath?: string
): Promise<void> {
  const gitDir = join(dir, '.git')

  if (existsSync(gitDir)) {
    const git = createGitInstance(dir, sshKeyPath)
    await git.fetch()
    return
  }

  const cloneOptions: Partial<SimpleGitOptions> = {
    unsafe: {
      allowUnsafeSshCommand: true,
    },
  }

  if (sshKeyPath) {
    cloneOptions.config = [
      `core.sshCommand=ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o BatchMode=yes`,
    ]
  }

  const git = simpleGit(cloneOptions)
  await git.clone(gitUrl, dir)
}

export async function fetchLatest(
  dir: string,
  branch: string,
  sshKeyPath?: string
): Promise<void> {
  const git = createGitInstance(dir, sshKeyPath)
  await git.fetch('origin', branch)
}

export async function getHeadHash(dir: string, branch: string): Promise<string> {
  const git = createGitInstance(dir)
  const result = await git.revparse([`origin/${branch}`])
  return result.trim()
}

export async function getNewCommits(
  dir: string,
  since: string,
  branch: string
): Promise<Commit[]> {
  const git = createGitInstance(dir)

  const headHash = await getHeadHash(dir, branch)
  if (since === headHash) {
    return []
  }

  const log = await git.log({
    from: since || undefined,
    to: `origin/${branch}`,
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
}
