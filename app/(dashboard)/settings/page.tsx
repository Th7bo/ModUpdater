import { parseConfig } from '@/src/config/env'

export default function SettingsPage() {
  const cfg = parseConfig()

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <div className="grid gap-3 max-w-2xl">
        <Row label="Build concurrency" value={String(cfg.BUILD_CONCURRENCY)} />
        <Row label="Debounce (ms)" value={String(cfg.DEBOUNCE_MS)} />
        <Row label="SSH keys directory" value={cfg.SSH_KEYS_DIR} />
        <Row label="Repos directory" value={cfg.REPOS_DIR} />
        <Row label="Logs directory" value={cfg.LOG_DIR} />
        <Row label="Default Discord channel" value={cfg.DEFAULT_DISCORD_CHANNEL_ID || '(not set)'} />
        <Row label="Default polling interval (ms)" value={String(cfg.DEFAULT_POLLING_INTERVAL_MS)} />
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 p-3 bg-slate-50 rounded-md text-sm">
      <span className="font-medium text-slate-600 min-w-[200px]">{label}</span>
      <span className="text-gray-900 font-mono">{value}</span>
    </div>
  )
}
