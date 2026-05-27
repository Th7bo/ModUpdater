import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { parseConfig } from '@/src/config/env'
import { db } from '@/src/db/client'
import { getRepo, updateRepo } from '@/src/db/queries/repos'
import { createBuildRun } from '@/src/db/queries/build-runs'
import { ensureCloned, fetchLatest, getHeadHash, getNewCommits, type Commit } from '@/src/git/repo-sync'
import { detectStonecutter, selectBuildTask } from '@/src/builder/stonecutter'
import { runBuild } from '@/src/builder/runner'
import { collectArtifacts } from '@/src/builder/artifacts'
import { sendSuccessNotification, sendFailureNotification } from '@/src/discord/notifications'
import { toPublicRepo } from '@/src/db/queries/repos'
import { enqueueBuild } from './build-queue'

export type TriggerSource = 'poll' | 'webhook' | 'manual' | 'sync'

export async function triggerBuild(
  repoId: string,
  source: TriggerSource = 'poll'
): Promise<void> {
  const config = parseConfig()
  const repo = await getRepo(db, repoId)

  if (!repo) {
    console.error(`[pipeline] Repo not found: ${repoId}`)
    return
  }

  if (repo.syncPaused) {
    console.log(`[pipeline] Repo ${repo.name} is paused, skipping`)
    return
  }

  const repoDir = join(config.REPOS_DIR, repo.id)

  await mkdir(config.REPOS_DIR, { recursive: true })

  console.log(`[pipeline] Ensuring repo ${repo.name} is cloned...`)
  await ensureCloned(repo.gitUrl, repoDir, repo.sshPrivateKeyPath ?? undefined)

  console.log(`[pipeline] Fetching latest for ${repo.name}...`)
  await fetchLatest(repoDir, repo.branch, repo.sshPrivateKeyPath ?? undefined)

  const headHash = await getHeadHash(repoDir, repo.branch)

  if (headHash === repo.lastCommitHash) {
    console.log(`[pipeline] No new commits for ${repo.name}, skipping build`)
    return
  }

  const commits = repo.lastCommitHash
    ? await getNewCommits(repoDir, repo.lastCommitHash, repo.branch)
    : await getNewCommits(repoDir, '', repo.branch)

  console.log(`[pipeline] ${commits.length} new commit(s) for ${repo.name}`)

  await enqueueBuild(async () => {
    await executeBuild(repo.id, repoDir, commits, source)
  })
}

async function executeBuild(
  repoId: string,
  repoDir: string,
  commits: Commit[],
  source: TriggerSource
): Promise<void> {
  const repo = await getRepo(db, repoId)
  if (!repo) return

  const startedAt = new Date()
  const hasStonecutter = await detectStonecutter(repoDir)
  const task = selectBuildTask(hasStonecutter, repo.customBuildTask)

  console.log(`[pipeline] Running build for ${repo.name} with task: ${task}`)

  const buildResult = await runBuild(repoDir, task)

  const finishedAt = new Date()
  let artifactPaths: string[] = []

  if (buildResult.success) {
    artifactPaths = await collectArtifacts(repoDir)
    console.log(`[pipeline] Build succeeded for ${repo.name}, ${artifactPaths.length} artifact(s)`)
  } else {
    console.log(`[pipeline] Build failed for ${repo.name}`)
  }

  const headHash = await getHeadHash(repoDir, repo.branch)

  try {
    if (buildResult.success) {
      await sendSuccessNotification(
        repo.discordChannelId,
        toPublicRepo(repo),
        commits,
        artifactPaths
      )
    } else {
      await sendFailureNotification(
        repo.discordChannelId,
        toPublicRepo(repo),
        commits,
        buildResult.logTail
      )
    }
  } catch (err) {
    console.error(`[pipeline] Discord notification failed for ${repo.name}:`, err)
  }

  await createBuildRun(db, {
    repoId: repo.id,
    status: buildResult.success ? 'success' : 'failed',
    triggeredBy: source,
    commitsJson: JSON.stringify(commits),
    artifactPathsJson: buildResult.success ? JSON.stringify(artifactPaths) : null,
    logTail: buildResult.logTail,
    startedAt,
    finishedAt,
  })

  await updateRepo(db, repo.id, {
    lastCommitHash: headHash,
    lastBuildStatus: buildResult.success ? 'success' : 'failed',
    lastBuildAt: finishedAt,
  })
}
