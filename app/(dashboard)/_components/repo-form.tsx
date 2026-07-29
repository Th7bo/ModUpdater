'use client'

import Link from 'next/link'
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

const inputCls = 'input'
const fieldCls = 'field'
const labelCls = 'field-label'
const hintCls = 'field-hint'
const errCls = 'field-error'

export function RepoForm({ action, defaultValues, repoId, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const errs = state.errors ?? {}

  return (
    <form action={formAction} className="form-shell">
      {state.message && <div className="alert">{state.message}</div>}

      <section className="form-section">
        <h2 className="form-section-title">Repository identity</h2>
        <p className="form-section-note">Core repository details used by clone, build, and notification jobs.</p>
        <div className="form-grid">
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="name">Name</label>
            <input className={inputCls} id="name" name="name" required defaultValue={defaultValues?.name ?? ''} />
            {errs.name && <p className={errCls}>{errs.name.join(', ')}</p>}
          </div>

          <div className={fieldCls}>
            <label className={labelCls} htmlFor="branch">Branch</label>
            <input className={inputCls} id="branch" name="branch" required defaultValue={defaultValues?.branch ?? 'main'} />
            {errs.branch && <p className={errCls}>{errs.branch.join(', ')}</p>}
          </div>

          <div className={`${fieldCls} md:col-span-2`}>
            <label className={labelCls} htmlFor="gitUrl">Git URL</label>
            <input className={inputCls} id="gitUrl" name="gitUrl" type="text" required defaultValue={defaultValues?.gitUrl ?? ''} />
            {errs.gitUrl && <p className={errCls}>{errs.gitUrl.join(', ')}</p>}
          </div>

          <div className={`${fieldCls} md:col-span-2`}>
            <label className={labelCls} htmlFor="discordChannelId">Discord channel ID</label>
            <input className={inputCls} id="discordChannelId" name="discordChannelId" required defaultValue={defaultValues?.discordChannelId ?? ''} />
            {errs.discordChannelId && <p className={errCls}>{errs.discordChannelId.join(', ')}</p>}
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2 className="form-section-title">Build orchestration</h2>
        <p className="form-section-note">Detection strategy, runtime version, and optional fork upstream settings.</p>
        <div className="form-grid">
          <div className={fieldCls}>
            <label className={labelCls} htmlFor="mode">Mode</label>
            <select className={inputCls} id="mode" name="mode" defaultValue={defaultValues?.mode ?? 'upstream'}>
              <option value="upstream">Upstream</option>
              <option value="fork">Fork</option>
            </select>
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
            <p className={hintCls}>Leave blank to use the default 15 minute interval.</p>
            {errs.pollingIntervalMs && <p className={errCls}>{errs.pollingIntervalMs.join(', ')}</p>}
          </div>

          <div className={fieldCls}>
            <label className={labelCls} htmlFor="jdkVersion">JDK version</label>
            <select className={inputCls} id="jdkVersion" name="jdkVersion" defaultValue={defaultValues?.jdkVersion ?? '21'}>
              <option value="21">JDK 21</option>
              <option value="25">JDK 25</option>
            </select>
            <p className={hintCls}>Select the Java version required by this mod.</p>
          </div>

          <div className={fieldCls}>
            <label className={labelCls} htmlFor="customBuildTask">Custom build task</label>
            <input className={inputCls} id="customBuildTask" name="customBuildTask" defaultValue={defaultValues?.customBuildTask ?? ''} />
            <p className={hintCls}>Gradle task name. Blank uses build.</p>
          </div>

          <div className={fieldCls}>
            <input type="hidden" name="notifyOnBuildStart" value="false" />
            <label className="flex items-start gap-3" htmlFor="notifyOnBuildStart">
              <input
                id="notifyOnBuildStart"
                name="notifyOnBuildStart"
                type="checkbox"
                value="true"
                defaultChecked={defaultValues?.notifyOnBuildStart ?? false}
                className="mt-1"
              />
              <span>
                <span className={labelCls}>Send build-start embed</span>
                <span className={`${hintCls} block`}>
                  Notify the Discord channel as soon as a build begins.
                </span>
              </span>
            </label>
          </div>

          <div className={fieldCls}>
            <label className={labelCls} htmlFor="webhookSecret">Webhook secret</label>
            <input className={inputCls} id="webhookSecret" name="webhookSecret" type="password" placeholder={defaultValues ? 'Leave blank to keep current' : ''} autoComplete="new-password" />
            <p className={hintCls}>Write-only. The current value is never shown.</p>
          </div>

          <div className={`${fieldCls} md:col-span-2`}>
            <label className={labelCls} htmlFor="upstreamUrl">Upstream URL</label>
            <input className={inputCls} id="upstreamUrl" name="upstreamUrl" type="text" defaultValue={defaultValues?.upstreamUrl ?? ''} />
            <p className={hintCls}>Required when mode is fork.</p>
            {errs.upstreamUrl && <p className={errCls}>{errs.upstreamUrl.join(', ')}</p>}
          </div>
        </div>
      </section>

      <SshKeySection
        repoId={repoId}
        publicKey={defaultValues?.sshPublicKey}
      />

      <div className="form-actions">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving...' : submitLabel}
        </button>
        <Link href="/repos" className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  )
}
