import { Client, GatewayIntentBits, ActivityType } from 'discord.js'

import { parseConfig } from '@/src/config/env'

declare global {
  // eslint-disable-next-line no-var
  var discordClient: Client | undefined
  // eslint-disable-next-line no-var
  var discordLoginPromise: Promise<void> | undefined
  // eslint-disable-next-line no-var
  var discordStatsInterval: ReturnType<typeof setInterval> | undefined
}

export function getDiscordClient(): Client {
  if (!globalThis.discordClient) {
    globalThis.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds],
    })

    const config = parseConfig()
    globalThis.discordLoginPromise = globalThis.discordClient.login(config.DISCORD_BOT_TOKEN).then(() => {
      console.log('[discord] Bot logged in')
      updateBotStatus()
      
      // Update status every 5 minutes
      if (!globalThis.discordStatsInterval) {
        globalThis.discordStatsInterval = setInterval(updateBotStatus, 5 * 60 * 1000)
      }
    })
  }

  return globalThis.discordClient
}

export async function waitForReady(): Promise<void> {
  if (globalThis.discordLoginPromise) {
    await globalThis.discordLoginPromise
  }
}

async function updateBotStatus(): Promise<void> {
  const client = globalThis.discordClient
  if (!client?.user) return

  try {
    const { db } = await import('@/src/db/client')
    const { repos } = await import('@/src/db/schema')
    const { buildRuns } = await import('@/src/db/schema')
    const { count, gte, and } = await import('drizzle-orm')

    const [repoCount] = await db.select({ count: count() }).from(repos)
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [buildCount] = await db
      .select({ count: count() })
      .from(buildRuns)
      .where(gte(buildRuns.startedAt, oneDayAgo))

    const statusText = `${repoCount.count} repos | ${buildCount.count} builds today`
    
    client.user.setActivity(statusText, { type: ActivityType.Watching })
  } catch (err) {
    console.error('[discord] Failed to update bot status:', err)
    client.user?.setActivity('ModUpdater', { type: ActivityType.Watching })
  }
}
