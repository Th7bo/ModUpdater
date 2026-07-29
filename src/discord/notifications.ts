import { EmbedBuilder, TextChannel } from 'discord.js'

import { getDiscordClient, waitForReady } from './client'
import type { PublicRepo } from '@/src/db/queries/repos'
import type { Commit } from '@/src/git/repo-sync'
import type { StoredArtifact } from '@/src/builder/artifacts'

function formatCommitList(commits: Commit[]): string {
  return commits
    .map((c) => `[\`${c.hash.slice(0, 7)}\`] ${c.message} — ${c.author}`)
    .join('\n')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface SuccessNotificationOptions {
  channelId: string
  repo: PublicRepo
  commits: Commit[]
  artifacts: StoredArtifact[]
  baseUrl: string
}

export async function sendBuildStartedNotification(
  channelId: string,
  repo: PublicRepo,
  commits: Commit[],
  task: string
): Promise<void> {
  const client = getDiscordClient()
  await waitForReady()

  const channel = (await client.channels.fetch(channelId)) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`Build started: ${repo.name}`)
    .setColor(0x3b82f6)
    .addFields(
      { name: 'Repository', value: repo.gitUrl, inline: true },
      { name: 'Branch', value: repo.branch, inline: true },
      { name: 'Task', value: task, inline: true }
    )

  if (commits.length > 0) {
    const commitText = formatCommitList(commits).slice(0, 1024)
    embed.addFields({ name: 'Commits', value: commitText })
  }

  await channel.send({ embeds: [embed] })
}

export async function sendSuccessNotification(
  options: SuccessNotificationOptions
): Promise<void> {
  const { channelId, repo, commits, artifacts, baseUrl } = options

  const client = getDiscordClient()
  await waitForReady()

  const channel = (await client.channels.fetch(channelId)) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`Build succeeded: ${repo.name}`)
    .setColor(0x22c55e)
    .addFields(
      { name: 'Repository', value: repo.gitUrl, inline: true },
      { name: 'Branch', value: repo.branch, inline: true }
    )

  if (commits.length > 0) {
    const commitText = formatCommitList(commits).slice(0, 1024)
    embed.addFields({ name: 'Commits', value: commitText })
  }

  if (artifacts.length > 0) {
    const artifactsUrl = `${baseUrl}/repos/${repo.id}/artifacts`
    const totalSize = artifacts.reduce((sum, a) => sum + a.size, 0)
    embed.addFields({
      name: 'Downloads',
      value: `[View ${artifacts.length} artifact${artifacts.length > 1 ? 's' : ''} (${formatFileSize(totalSize)})](${artifactsUrl})`,
    })
  }

  await channel.send({ embeds: [embed] })
}

export async function sendFailureNotification(
  channelId: string,
  repo: PublicRepo,
  commits: Commit[],
  logTail: string
): Promise<void> {
  const client = getDiscordClient()
  await waitForReady()

  const channel = (await client.channels.fetch(channelId)) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`Build failed: ${repo.name}`)
    .setColor(0xef4444)
    .addFields(
      { name: 'Repository', value: repo.gitUrl, inline: true },
      { name: 'Branch', value: repo.branch, inline: true }
    )

  if (commits.length > 0) {
    const commitText = formatCommitList(commits).slice(0, 1024)
    embed.addFields({ name: 'Commits', value: commitText })
  }

  const maxLogLength = 1000
  const truncatedLog = logTail.length > maxLogLength
    ? '...' + logTail.slice(-(maxLogLength - 3))
    : logTail
  embed.addFields({
    name: 'Build output (last lines)',
    value: '```\n' + truncatedLog + '\n```',
  })

  await channel.send({ embeds: [embed] })
}

export async function sendConflictNotification(
  channelId: string,
  repo: PublicRepo,
  upstreamUrl: string,
  commitRange: string,
  conflictingFiles: string[]
): Promise<void> {
  const client = getDiscordClient()
  await waitForReady()

  const channel = (await client.channels.fetch(channelId)) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`Merge conflict: ${repo.name}`)
    .setColor(0xf97316)
    .addFields(
      { name: 'Fork', value: repo.gitUrl, inline: true },
      { name: 'Upstream', value: upstreamUrl, inline: true },
      { name: 'Branch', value: repo.branch, inline: true },
      { name: 'Commit range', value: commitRange }
    )

  if (conflictingFiles.length > 0) {
    const maxFiles = 15
    const fileList = conflictingFiles.slice(0, maxFiles).join('\n')
    const truncated = conflictingFiles.length > maxFiles
      ? `\n... and ${conflictingFiles.length - maxFiles} more`
      : ''
    embed.addFields({
      name: 'Conflicting files',
      value: '```\n' + fileList + truncated + '\n```',
    })
  }

  embed.addFields({
    name: 'Action required',
    value: 'Resolve the conflict manually, then use the dashboard to re-enable sync.',
  })

  await channel.send({ embeds: [embed] })
}
