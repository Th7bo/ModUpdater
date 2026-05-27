import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_CLIENT_SECRET: z.string().min(1, 'DISCORD_CLIENT_SECRET is required'),
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  BUILD_CONCURRENCY: z.coerce.number().int().positive().default(2),
  DEBOUNCE_MS: z.coerce.number().int().positive().default(60000),
  SSH_KEYS_DIR: z.string().default('./data/keys'),
  REPOS_DIR: z.string().default('./data/repos'),
  LOG_DIR: z.string().default('./data/logs'),
  ARTIFACTS_DIR: z.string().default('./data/artifacts'),
  BASE_URL: z.string().default('http://localhost:3000'),
  DEFAULT_DISCORD_CHANNEL_ID: z.string().default(''),
  DEFAULT_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(900000),
})

export type Config = z.infer<typeof envSchema>

export function parseConfig(env: Record<string, string | undefined> = process.env): Config {
  return envSchema.parse(env)
}
