'use client'

import { useState } from 'react'
import { generateSshKeyAction } from '@/app/(dashboard)/actions'
import { CopyButton } from './copy-button'

type Props = {
  repoId?: string
  mode?: string
  publicKey?: string | null
}

const inputCls = 'input'
const fieldCls = 'field'
const labelCls = 'field-label'
const hintCls = 'field-hint'
const errCls = 'field-error'

export function SshKeySection({ repoId, mode, publicKey: initialPublicKey }: Props) {
  const [publicKey, setPublicKey] = useState(initialPublicKey)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!repoId) return
    setGenerating(true)
    setError(null)

    const result = await generateSshKeyAction(repoId)
    setGenerating(false)

    if (result.success && result.publicKey) {
      setPublicKey(result.publicKey)
    } else {
      setError(result.error || 'Failed to generate SSH key')
    }
  }

  const isFork = mode === 'fork'
  const canGenerate = repoId && isFork

  return (
    <section className="form-section">
      <h2 className="form-section-title">SSH access</h2>
      <p className="form-section-note">Deploy key material for fork synchronization and private repository access.</p>

      <div className="mt-4 space-y-5">
        {publicKey && (
          <div className={fieldCls}>
            <label className={labelCls}>SSH public key</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <textarea
                className={`${inputCls} cell-code min-h-24`}
                readOnly
                rows={3}
                value={publicKey}
              />
              <CopyButton text={publicKey} />
            </div>
            <p className={hintCls}>
              Add this as a Deploy Key in GitHub. Enable write access when the platform must push to the fork.
            </p>
          </div>
        )}

        {canGenerate && (
          <div className={fieldCls}>
            <label className={labelCls}>Generate SSH key</label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="btn btn-secondary"
              >
                {generating ? 'Generating...' : publicKey ? 'Regenerate key' : 'Generate key'}
              </button>
              <span className={hintCls}>
                {publicKey
                  ? 'Regenerating invalidates the current key.'
                  : 'Generate a key pair for SSH authentication.'}
              </span>
            </div>
            {error && <p className={errCls}>{error}</p>}
          </div>
        )}

        <div className={fieldCls}>
          <label className={labelCls} htmlFor="sshPrivateKeyContent">SSH private key (manual)</label>
          <textarea
            className={`${inputCls} cell-code min-h-36`}
            id="sshPrivateKeyContent"
            name="sshPrivateKeyContent"
            rows={6}
            placeholder="Paste private key to upload manually"
            autoComplete="off"
          />
          <p className={hintCls}>
            Optional. Paste your own private key instead of generating one. The key is stored on disk with 600 permissions.
          </p>
        </div>
      </div>
    </section>
  )
}
