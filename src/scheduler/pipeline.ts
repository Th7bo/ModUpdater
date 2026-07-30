import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

import { parseConfig } from '@/src/config/env'
import { db, pool } from '@/src/db/client'
import { tryAcquireBuildLock, type ReleaseBuildLock } from '@/src/db/build-lock'
import { getRepo, updateRepo } from '@/src/db/queries/repos'
import { createBuildRun } from '@/src/db/queries/build-runs'
import { ensureCloned, fetchLatest, getHeadHash, getNewCommits, type Commit } from '@/src/git/repo-sync'
import { detectStonecutter, selectBuildTask } from '@/src/builder/stonecutter'
import { runBuild, type JdkVersion } from '@/src/builder/runner'
import {
  collectArtifacts,
  filterDismissedArtifacts,
  storeArtifacts,
  cleanupOldArtifacts,
} from '@/src/builder/artifacts'
import { listBuildRuns } from '@/src/db/queries/build-runs'
import {
  sendBuildStartedNotification,
  sendSuccessNotification,
  sendFailureNotification,
} from '@/src/discord/notifications'
import { toPublicRepo } from '@/src/db/queries/repos'
import { enqueueBuild } from './build-queue'
import { createLogFile, finalizeLog, getRelativeLogPath } from '@/src/logging/activity-log'
import { setActiveBuild, clearActiveBuild } from './build-status'

export type TriggerSource = 'poll' | 'webhook' | 'manual' | 'sync'

export interface TriggerOptions {
  source?: TriggerSource
  force?: boolean
}

const inFlightBuilds = new Set<string>()

export async function triggerBuild(
  repoId: string,
  sourceOrOptions: TriggerSource | TriggerOptions = 'poll'
): Promise<void> {
  const options = typeof sourceOrOptions === 'string'
    ? { source: sourceOrOptions, force: false }
    : { source: sourceOrOptions.source ?? 'poll', force: sourceOrOptions.force ?? false }

  const { source, force } = options
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

  if (!force && headHash === repo.lastCommitHash) {
    console.log(`[pipeline] No new commits for ${repo.name}, skipping build`)
    return
  }

  const buildKey = `${repo.id}:${headHash}`
  if (inFlightBuilds.has(buildKey)) {
    console.log(`[pipeline] Build already in flight for ${repo.name} at ${headHash}, skipping duplicate trigger`)
    return
  }

  inFlightBuilds.add(buildKey)
  let releaseBuildLock: ReleaseBuildLock | null = null

  try {
    releaseBuildLock = await tryAcquireBuildLock(pool, buildKey)
    if (!releaseBuildLock) {
      console.log(`[pipeline] Build claimed by another process for ${repo.name} at ${headHash}, skipping duplicate trigger`)
      return
    }

    const commits = repo.lastCommitHash
      ? await getNewCommits(repoDir, repo.lastCommitHash, repo.branch)
      : await getNewCommits(repoDir, '', repo.branch)

    console.log(`[pipeline] ${commits.length} new commit(s) for ${repo.name}${force ? ' (forced)' : ''}`)

    await enqueueBuild(async () => {
      await executeBuild(repo.id, repoDir, commits, source)
    })
  } finally {
    if (releaseBuildLock) {
      await releaseBuildLock()
    }
    inFlightBuilds.delete(buildKey)
  }
}

async function executeBuild(
  repoId: string,
  repoDir: string,
  commits: Commit[],
  source: TriggerSource
): Promise<void> {
  const config = parseConfig()
  const repo = await getRepo(db, repoId)
  if (!repo) return

  const buildId = randomUUID()
  const startedAt = new Date()
  const hasStonecutter = await detectStonecutter(repoDir)
  const task = selectBuildTask(hasStonecutter, repo.customBuildTask)

  console.log(`[pipeline] Running build for ${repo.name} with task: ${task}`)

  let logHandle
  let logPath: string | null = null
  try {
    logHandle = await createLogFile(repo.id, 'build')
    setActiveBuild(repo.id, {
      buildId,
      repoId: repo.id,
      repoName: repo.name,
      logPath: logHandle.path,
      startedAt,
    })
  } catch (err) {
    console.error(`[pipeline] Failed to create log file for ${repo.name}:`, err)
  }

  if (repo.notifyOnBuildStart) {
    try {
      await sendBuildStartedNotification(
        repo.discordChannelId,
        toPublicRepo(repo),
        commits,
        task
      )
    } catch (err) {
      console.error(`[pipeline] Build-start notification failed for ${repo.name}:`, err)
    }
  }

  const jdkVersion = (repo.jdkVersion ?? '21') as JdkVersion
  const buildResult = await runBuild(repoDir, task, { logHandle, jdkVersion })

  clearActiveBuild(repo.id)

  if (logHandle) {
    try {
      await finalizeLog(logHandle)
      logPath = getRelativeLogPath(logHandle.path)
    } catch (err) {
      console.error(`[pipeline] Failed to finalize log for ${repo.name}:`, err)
    }
  }

  const finishedAt = new Date()
  let storedArtifacts: Awaited<ReturnType<typeof storeArtifacts>> = []

  if (buildResult.success) {
    const collectedArtifactPaths = await collectArtifacts(repoDir)
    const artifactPaths = filterDismissedArtifacts(
      collectedArtifactPaths,
      repo.artifactExcludePatterns
    )
    const dismissedCount = collectedArtifactPaths.length - artifactPaths.length
    console.log(`[pipeline] Build succeeded for ${repo.name}, ${artifactPaths.length} artifact(s)`)
    if (dismissedCount > 0) {
      console.log(`[pipeline] Dismissed ${dismissedCount} artifact(s) for ${repo.name}`)
    }

    if (artifactPaths.length > 0) {
      try {
        await mkdir(config.ARTIFACTS_DIR, { recursive: true })
        storedArtifacts = await storeArtifacts(buildId, artifactPaths, config.ARTIFACTS_DIR)
        console.log(`[pipeline] Stored ${storedArtifacts.length} artifact(s) for download`)
      } catch (err) {
        console.error(`[pipeline] Failed to store artifacts for ${repo.name}:`, err)
      }
    }
  } else {
    console.log(`[pipeline] Build failed for ${repo.name}`)
  }

  const headHash = await getHeadHash(repoDir, repo.branch)

  try {
    if (buildResult.success) {
      await sendSuccessNotification({
        channelId: repo.discordChannelId,
        repo: toPublicRepo(repo),
        commits,
        artifacts: storedArtifacts,
        baseUrl: config.BASE_URL,
      })
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
    id: buildId,
    repoId: repo.id,
    status: buildResult.success ? 'success' : 'failed',
    triggeredBy: source,
    commitsJson: JSON.stringify(commits),
    artifactPathsJson: buildResult.success ? JSON.stringify(storedArtifacts) : null,
    logTail: buildResult.logTail,
    logPath,
    startedAt,
    finishedAt,
  })

  await updateRepo(db, repo.id, {
    lastCommitHash: headHash,
    lastBuildStatus: buildResult.success ? 'success' : 'failed',
    lastBuildAt: finishedAt,
  })

  // Cleanup old artifacts, keeping only the last 3 successful builds for this repo
  try {
    const recentBuilds = await listBuildRuns(db, repo.id, 20)
    const successfulBuildsWithArtifacts = recentBuilds
      .filter((b) => b.status === 'success' && b.artifactPathsJson)

    // Keep first 3, delete the rest
    const buildsToDelete = successfulBuildsWithArtifacts.slice(3)
    if (buildsToDelete.length > 0) {
      const buildIdsToDelete = buildsToDelete.map((b) => b.id)
      const removed = await cleanupOldArtifacts(buildIdsToDelete, config.ARTIFACTS_DIR)
      if (removed > 0) {
        console.log(`[pipeline] Cleaned up ${removed} old artifact folder(s) for ${repo.name}`)
      }
    }
  } catch (err) {
    console.error(`[pipeline] Failed to cleanup old artifacts for ${repo.name}:`, err)
  }
}
