import type { ReactNode } from 'react'
import Link from 'next/link'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

type PageHeaderProps = {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  backHref?: string
  backLabel?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = 'Back',
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {backHref && (
          <Link href={backHref} className="back-link">
            {'<-'} {backLabel}
          </Link>
        )}
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

type StatTileProps = {
  label: string
  value: string | number
  detail?: string
  tone?: Tone
}

export function StatTile({ label, value, detail, tone = 'neutral' }: StatTileProps) {
  const toneClass = tone === 'neutral' ? '' : ` ${tone}`

  return (
    <div className={`stat-tile${toneClass}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  )
}

type PanelProps = {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function Panel({ title, subtitle, actions, children }: PanelProps) {
  return (
    <section className="panel">
      {(title || subtitle || actions) && (
        <div className="panel-header">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h2 className="empty-title">{title}</h2>
      <p className="empty-copy">{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = status ?? 'none'
  const className = statusClass(normalized)

  return <span className={`status ${className}`}>{normalized}</span>
}

export function MetaPill({ children }: { children: ReactNode }) {
  return <span className="meta-pill">{children}</span>
}

function statusClass(status: string) {
  switch (status) {
    case 'success':
      return 'status-success'
    case 'failed':
      return 'status-failed'
    case 'pending':
      return 'status-pending'
    case 'paused':
      return 'status-paused'
    case 'running':
      return 'status-running'
    case 'finished':
      return 'status-finished'
    case 'connecting':
      return 'status-connecting'
    case 'error':
      return 'status-error'
    case 'admin':
      return 'status-admin'
    case 'idle':
      return 'status-idle'
    default:
      return 'status-none'
  }
}
