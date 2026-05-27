'use client'

import { useActionState } from 'react'
import type { ActionState } from '@/app/(dashboard)/actions'
import type { PublicRepo } from '@/src/db/queries/repos'

type Props = {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>
  defaultValues?: Partial<PublicRepo>
  submitLabel: string
}

export function RepoForm({ action, defaultValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const errs = state.errors ?? {}

  return (
    <form action={formAction} className="form">
      {state.message && <div className="error-box">{state.message}</div>}

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={defaultValues?.name ?? ''} />
        {errs.name && <span className="hint" style={{ color: '#b91c1c' }}>{errs.name.join(', ')}</span>}
      </div>

      <div className="field">
        <label htmlFor="gitUrl">Git URL</label>
        <input id="gitUrl" name="gitUrl" type="url" required defaultValue={defaultValues?.gitUrl ?? ''} />
        {errs.gitUrl && <span className="hint" style={{ color: '#b91c1c' }}>{errs.gitUrl.join(', ')}</span>}
      </div>

      <div className="field">
        <label htmlFor="mode">Mode</label>
        <select id="mode" name="mode" defaultValue={defaultValues?.mode ?? 'upstream'}>
          <option value="upstream">Upstream</option>
          <option value="fork">Fork</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="branch">Branch</label>
        <input id="branch" name="branch" required defaultValue={defaultValues?.branch ?? 'main'} />
        {errs.branch && <span className="hint" style={{ color: '#b91c1c' }}>{errs.branch.join(', ')}</span>}
      </div>

      <div className="field">
        <label htmlFor="detectionMethod">Detection method</label>
        <select
          id="detectionMethod"
          name="detectionMethod"
          defaultValue={defaultValues?.detectionMethod ?? 'polling'}
        >
          <option value="polling">Polling</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="pollingIntervalMs">Polling interval (ms)</label>
        <input
          id="pollingIntervalMs"
          name="pollingIntervalMs"
          type="number"
          min={60000}
          defaultValue={defaultValues?.pollingIntervalMs ?? ''}
        />
        <span className="hint">Leave blank to use the default (15 minutes)</span>
        {errs.pollingIntervalMs && (
          <span className="hint" style={{ color: '#b91c1c' }}>{errs.pollingIntervalMs.join(', ')}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="discordChannelId">Discord channel ID</label>
        <input
          id="discordChannelId"
          name="discordChannelId"
          required
          defaultValue={defaultValues?.discordChannelId ?? ''}
        />
        {errs.discordChannelId && (
          <span className="hint" style={{ color: '#b91c1c' }}>{errs.discordChannelId.join(', ')}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="upstreamUrl">Upstream URL</label>
        <input
          id="upstreamUrl"
          name="upstreamUrl"
          type="url"
          defaultValue={defaultValues?.upstreamUrl ?? ''}
        />
        <span className="hint">Required when mode is &ldquo;fork&rdquo;</span>
        {errs.upstreamUrl && (
          <span className="hint" style={{ color: '#b91c1c' }}>{errs.upstreamUrl.join(', ')}</span>
        )}
      </div>

      <div className="field">
        <label htmlFor="customBuildTask">Custom build task</label>
        <input
          id="customBuildTask"
          name="customBuildTask"
          defaultValue={defaultValues?.customBuildTask ?? ''}
        />
        <span className="hint">Gradle task name (defaults to &ldquo;build&rdquo;)</span>
      </div>

      <div className="field">
        <label htmlFor="webhookSecret">Webhook secret</label>
        <input
          id="webhookSecret"
          name="webhookSecret"
          type="password"
          placeholder={defaultValues ? 'Leave blank to keep current' : ''}
          autoComplete="new-password"
        />
        <span className="hint">Write-only — current value is never shown</span>
      </div>

      <div className="actions">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : submitLabel}
        </button>
        <a href="/repos" className="btn btn-secondary">Cancel</a>
      </div>
    </form>
  )
}
