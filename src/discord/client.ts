import { Client, GatewayIntentBits } from 'discord.js'

import { parseConfig } from '@/src/config/env'

declare global {
  // eslint-disable-next-line no-var
  var discordClient: Client | undefined
  // eslint-disable-next-line no-var
  var discordLoginPromise: Promise<void> | undefined
}

export function getDiscordClient(): Client {
  if (!globalThis.discordClient) {
    globalThis.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds],
    })

    const config = parseConfig()
    globalThis.discordLoginPromise = globalThis.discordClient.login(config.DISCORD_BOT_TOKEN).then(() => {
      console.log('[discord] Bot logged in')
    })
  }

  return globalThis.discordClient
}

export async function waitForReady(): Promise<void> {
  if (globalThis.discordLoginPromise) {
    await globalThis.discordLoginPromise
  }
}
