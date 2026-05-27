import { AttachmentBuilder, EmbedBuilder, TextChannel } from 'discord.js'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { getDiscordClient, waitForReady } from './client'
import type { PublicRepo } from '@/src/db/queries/repos'
import type { Commit } from '@/src/git/repo-sync'

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024

function formatCommitList(commits: Commit[]): string {
  return commits
    .map((c) => `[\`${c.hash.slice(0, 7)}\`] ${c.message} — ${c.author}`)
    .join('\n')
}

export async function sendSuccessNotification(
  channelId: string,
  repo: PublicRepo,
  commits: Commit[],
  artifactPaths: string[]
): Promise<void> {
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

  const attachments: AttachmentBuilder[] = []
  const oversizedFiles: string[] = []

  for (const path of artifactPaths) {
    const fileStat = await stat(path)
    if (fileStat.size <= MAX_ATTACHMENT_SIZE) {
      attachments.push(new AttachmentBuilder(path))
    } else {
      oversizedFiles.push(basename(path))
    }
  }

  if (oversizedFiles.length > 0) {
    embed.addFields({
      name: 'Large files (not attached)',
      value: oversizedFiles.join(', '),
    })
  }

  await channel.send({ embeds: [embed], files: attachments })
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

  const truncatedLog = logTail.slice(-1900)
  embed.addFields({
    name: 'Build output (last lines)',
    value: '```\n' + truncatedLog + '\n```',
  })

  await channel.send({ embeds: [embed] })
}
