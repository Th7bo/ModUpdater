export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { db } = await import('@/src/db/client')
      const { startAllPollers } = await import('@/src/scheduler')
      await startAllPollers(db)
    } catch (err) {
      console.error('[instrumentation] Failed to start pollers:', err)
    }
  }
}
