import { Client, GatewayIntentBits } from 'discord.js'

import { parseConfig } from '@/src/config/env'

let client: Client | null = null
let loginPromise: Promise<void> | null = null

export function getDiscordClient(): Client {
  if (!client) {
    client = new Client({
      intents: [GatewayIntentBits.Guilds],
    })

    const config = parseConfig()
    loginPromise = client.login(config.DISCORD_BOT_TOKEN).then(() => {
      console.log('[discord] Bot logged in')
    })
  }

  return client
}

export async function waitForReady(): Promise<void> {
  if (loginPromise) {
    await loginPromise
  }
}
