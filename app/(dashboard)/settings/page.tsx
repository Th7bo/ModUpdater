import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { parseConfig } from '@/src/config/env'
import { PageHeader, Panel, StatTile } from '@/app/(dashboard)/_components/dashboard-ui'

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/repos')
  }

  const cfg = parseConfig()

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Runtime settings"
        title="System configuration"
        description="Read-only operational values loaded from the active environment."
      />

      <div className="metric-grid">
        <StatTile label="Concurrency" value={cfg.BUILD_CONCURRENCY} detail="Parallel build workers" tone="accent" />
        <StatTile label="Debounce" value={`${cfg.DEBOUNCE_MS} ms`} detail="Webhook and poll coalescing" />
        <StatTile label="Polling" value={`${Math.round(cfg.DEFAULT_POLLING_INTERVAL_MS / 60000)} min`} detail="Default repository cadence" />
        <StatTile label="Discord" value={cfg.DEFAULT_DISCORD_CHANNEL_ID ? 'set' : 'unset'} detail="Default channel binding" tone={cfg.DEFAULT_DISCORD_CHANNEL_ID ? 'success' : 'warning'} />
      </div>

      <Panel title="Paths and channels" subtitle="Server directories and default notification targets">
        <div>
          <Row label="SSH keys directory" value={cfg.SSH_KEYS_DIR} />
          <Row label="Repos directory" value={cfg.REPOS_DIR} />
          <Row label="Logs directory" value={cfg.LOG_DIR} />
          <Row label="Default Discord channel" value={cfg.DEFAULT_DISCORD_CHANNEL_ID || '(not set)'} />
          <Row label="Default polling interval" value={`${cfg.DEFAULT_POLLING_INTERVAL_MS} ms`} />
          <Row label="Build concurrency" value={String(cfg.BUILD_CONCURRENCY)} />
          <Row label="Debounce" value={`${cfg.DEBOUNCE_MS} ms`} />
        </div>
      </Panel>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="config-row">
      <span className="config-label">{label}</span>
      <span className="config-value">{value}</span>
    </div>
  )
}
