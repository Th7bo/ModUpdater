import type { Config } from 'drizzle-kit'

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/modupdater'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config
