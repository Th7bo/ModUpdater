export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const { db } = await import('@/src/db/client')
    await migrate(db, { migrationsFolder: './src/db/migrations' })
  }
}
