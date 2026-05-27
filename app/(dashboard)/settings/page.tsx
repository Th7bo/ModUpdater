import { parseConfig } from '@/src/config/env'

export default function SettingsPage() {
  const cfg = parseConfig()

  return (
    <>
      <h1>Settings</h1>
      <div className="settings-grid">
        <Row label="Build concurrency" value={String(cfg.BUILD_CONCURRENCY)} />
        <Row label="Debounce (ms)" value={String(cfg.DEBOUNCE_MS)} />
        <Row label="SSH keys directory" value={cfg.SSH_KEYS_DIR} />
        <Row label="Default Discord channel" value={cfg.DEFAULT_DISCORD_CHANNEL_ID || '(not set)'} />
        <Row label="Default polling interval (ms)" value={String(cfg.DEFAULT_POLLING_INTERVAL_MS)} />
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span className="setting-key">{label}</span>
      <span className="setting-val">{value}</span>
    </div>
  )
}
