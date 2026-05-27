'use client'

import { useActionState } from 'react'
import type { ActionState } from '@/app/(dashboard)/actions'
import type { PublicRepo } from '@/src/db/queries/repos'
import { SshKeySection } from './ssh-key-section'

type Props = {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>
  defaultValues?: Partial<PublicRepo> & { sshPublicKey?: string | null }
  repoId?: string
  submitLabel: string
}

const inputCls =
  'px-3 py-2 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
const fieldCls = 'flex flex-col gap-1.5'
const labelCls = 'text-sm font-medium text-gray-700'
const hintCls  = 'text-xs text-gray-500'
const errCls   = 'text-xs text-red-600'

export function RepoForm({ action, defaultValues, repoId, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const errs = state.errors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-2xl">
      {state.message && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {state.message}
        </div>
      )}

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="name">Name</label>
        <input className={inputCls} id="name" name="name" required defaultValue={defaultValues?.name ?? ''} />
        {errs.name && <p className={errCls}>{errs.name.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="gitUrl">Git URL</label>
        <input className={inputCls} id="gitUrl" name="gitUrl" type="url" required defaultValue={defaultValues?.gitUrl ?? ''} />
        {errs.gitUrl && <p className={errCls}>{errs.gitUrl.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="mode">Mode</label>
        <select className={inputCls} id="mode" name="mode" defaultValue={defaultValues?.mode ?? 'upstream'}>
          <option value="upstream">Upstream</option>
          <option value="fork">Fork</option>
        </select>
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="branch">Branch</label>
        <input className={inputCls} id="branch" name="branch" required defaultValue={defaultValues?.branch ?? 'main'} />
        {errs.branch && <p className={errCls}>{errs.branch.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="detectionMethod">Detection method</label>
        <select className={inputCls} id="detectionMethod" name="detectionMethod" defaultValue={defaultValues?.detectionMethod ?? 'polling'}>
          <option value="polling">Polling</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="pollingIntervalMs">Polling interval (ms)</label>
        <input className={inputCls} id="pollingIntervalMs" name="pollingIntervalMs" type="number" min={60000} defaultValue={defaultValues?.pollingIntervalMs ?? ''} />
        <p className={hintCls}>Leave blank to use the default (15 minutes)</p>
        {errs.pollingIntervalMs && <p className={errCls}>{errs.pollingIntervalMs.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="discordChannelId">Discord channel ID</label>
        <input className={inputCls} id="discordChannelId" name="discordChannelId" required defaultValue={defaultValues?.discordChannelId ?? ''} />
        {errs.discordChannelId && <p className={errCls}>{errs.discordChannelId.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="upstreamUrl">Upstream URL</label>
        <input className={inputCls} id="upstreamUrl" name="upstreamUrl" type="url" defaultValue={defaultValues?.upstreamUrl ?? ''} />
        <p className={hintCls}>Required when mode is &ldquo;fork&rdquo;</p>
        {errs.upstreamUrl && <p className={errCls}>{errs.upstreamUrl.join(', ')}</p>}
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="customBuildTask">Custom build task</label>
        <input className={inputCls} id="customBuildTask" name="customBuildTask" defaultValue={defaultValues?.customBuildTask ?? ''} />
        <p className={hintCls}>Gradle task name (defaults to &ldquo;build&rdquo;)</p>
      </div>

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="webhookSecret">Webhook secret</label>
        <input className={inputCls} id="webhookSecret" name="webhookSecret" type="password" placeholder={defaultValues ? 'Leave blank to keep current' : ''} autoComplete="new-password" />
        <p className={hintCls}>Write-only — current value is never shown</p>
      </div>

      <SshKeySection
        repoId={repoId}
        mode={defaultValues?.mode}
        publicKey={defaultValues?.sshPublicKey}
      />

      <div className="flex gap-2 items-center pt-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : submitLabel}
        </button>
        <a href="/repos" className="btn btn-secondary">Cancel</a>
      </div>
    </form>
  )
}
