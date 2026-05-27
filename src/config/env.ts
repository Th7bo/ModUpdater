import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  AUTH_EMAIL_FROM: z.string().email('AUTH_EMAIL_FROM must be a valid email address'),
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  BUILD_CONCURRENCY: z.coerce.number().int().positive().default(2),
  DEBOUNCE_MS: z.coerce.number().int().positive().default(60000),
  SSH_KEYS_DIR: z.string().default('./data/keys'),
  REPOS_DIR: z.string().default('./data/repos'),
  LOG_DIR: z.string().default('./data/logs'),
  DEFAULT_DISCORD_CHANNEL_ID: z.string().default(''),
  DEFAULT_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(900000),
})

export type Config = z.infer<typeof envSchema>

export function parseConfig(env: Record<string, string | undefined> = process.env): Config {
  return envSchema.parse(env)
}
