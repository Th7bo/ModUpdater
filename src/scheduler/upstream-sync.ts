import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { parseConfig } from '@/src/config/env'
import { db } from '@/src/db/client'
import { getRepo, pauseRepo, toPublicRepo } from '@/src/db/queries/repos'
import {
  ensureUpstreamRemote,
  fetchUpstream,
  getUpstreamOnlyCommits,
  snapshotPreMergeState,
  attemptMerge,
  abortMergeAndRestore,
  pushToOrigin,
} from '@/src/git/upstream-sync'
import { ensureCloned, fetchLatest } from '@/src/git/repo-sync'
import { createLogFile, appendLog, finalizeLog } from '@/src/logging/activity-log'
import { sendConflictNotification } from '@/src/discord/notifications'
import { triggerBuild } from './pipeline'
import { debounce } from './debouncer'

export async function syncForkUpstream(repoId: string): Promise<void> {
  const config = parseConfig()
  const repo = await getRepo(db, repoId)

  if (!repo) {
    console.error(`[upstream-sync] Repo not found: ${repoId}`)
    return
  }

  if (repo.mode !== 'fork') {
    console.log(`[upstream-sync] Repo ${repo.name} is not a fork, skipping`)
    return
  }

  if (repo.syncPaused) {
    console.log(`[upstream-sync] Repo ${repo.name} is paused, skipping`)
    return
  }

  if (!repo.upstreamUrl) {
    console.log(`[upstream-sync] Repo ${repo.name} has no upstream URL, skipping`)
    return
  }

  const repoDir = join(config.REPOS_DIR, repo.id)
  await mkdir(config.REPOS_DIR, { recursive: true })

  let logHandle
  try {
    logHandle = await createLogFile(repo.id, 'sync')
    await appendLog(logHandle, `Starting upstream sync for ${repo.name}`)
  } catch (err) {
    console.error(`[upstream-sync] Failed to create log file for ${repo.name}:`, err)
  }

  try {
    await appendLog(logHandle!, `Ensuring repo is cloned...`)
    await ensureCloned(repo.gitUrl, repoDir, repo.sshPrivateKeyPath ?? undefined)

    await appendLog(logHandle!, `Syncing local branch with fork remote...`)
    await fetchLatest(repoDir, repo.branch, repo.sshPrivateKeyPath ?? undefined)

    await appendLog(logHandle!, `Setting up upstream remote: ${repo.upstreamUrl}`)
    await ensureUpstreamRemote(repoDir, repo.upstreamUrl, repo.sshPrivateKeyPath ?? undefined)

    await appendLog(logHandle!, `Fetching from upstream...`)
    await fetchUpstream(repoDir, repo.branch, repo.sshPrivateKeyPath ?? undefined)

    const upstreamCommits = await getUpstreamOnlyCommits(repoDir, repo.branch)
    await appendLog(logHandle!, `Found ${upstreamCommits.length} upstream commit(s)`)

    if (upstreamCommits.length === 0) {
      await appendLog(logHandle!, 'No upstream commits to merge')
      if (logHandle) await finalizeLog(logHandle)
      return
    }

    await appendLog(logHandle!, `Taking pre-merge snapshot...`)
    const snapshotHash = await snapshotPreMergeState(repoDir)

    await appendLog(logHandle!, `Attempting merge of upstream/${repo.branch}...`)
    const mergeResult = await attemptMerge(repoDir, repo.branch)

    if (!mergeResult.success) {
      await appendLog(logHandle!, `Merge failed${mergeResult.conflicting ? ' due to conflicts' : ''}`)

      if (mergeResult.conflicting && mergeResult.conflictingFiles) {
        await appendLog(logHandle!, `Conflicting files: ${mergeResult.conflictingFiles.join(', ')}`)
      }

      await appendLog(logHandle!, `Aborting merge and restoring to ${snapshotHash}...`)
      await abortMergeAndRestore(repoDir, snapshotHash)

      await appendLog(logHandle!, 'Pausing repository due to merge conflict')
      await pauseRepo(db, repo.id, 'Merge conflict with upstream')

      const firstCommit = upstreamCommits[0]
      const lastCommit = upstreamCommits[upstreamCommits.length - 1]
      const commitRange = upstreamCommits.length === 1
        ? firstCommit.hash.slice(0, 7)
        : `${firstCommit.hash.slice(0, 7)}..${lastCommit.hash.slice(0, 7)}`

      try {
        await sendConflictNotification(
          repo.discordChannelId,
          toPublicRepo(repo),
          repo.upstreamUrl,
          commitRange,
          mergeResult.conflictingFiles ?? []
        )
        await appendLog(logHandle!, 'Sent conflict notification to Discord')
      } catch (err) {
        console.error(`[upstream-sync] Discord notification failed for ${repo.name}:`, err)
        await appendLog(logHandle!, `Failed to send Discord notification: ${err}`)
      }

      if (logHandle) await finalizeLog(logHandle)
      return
    }

    await appendLog(logHandle!, 'Merge successful, pushing to origin...')
    await pushToOrigin(repoDir, repo.branch, repo.sshPrivateKeyPath ?? undefined)

    await appendLog(logHandle!, 'Push successful, triggering build...')
    if (logHandle) await finalizeLog(logHandle)

    debounce(`repo:${repo.id}`, () => triggerBuild(repo.id, 'sync'))

  } catch (err) {
    console.error(`[upstream-sync] Error syncing ${repo.name}:`, err)
    if (logHandle) {
      try {
        await appendLog(logHandle, `Error: ${err}`)
        await finalizeLog(logHandle)
      } catch {
        // ignore log finalization errors
      }
    }
  }
}
