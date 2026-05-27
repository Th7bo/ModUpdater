'use client'

import { useState } from 'react'
import { generateSshKeyAction } from '@/app/(dashboard)/actions'
import { CopyButton } from './copy-button'

type Props = {
  repoId?: string
  mode?: string
  publicKey?: string | null
}

const inputCls =
  'px-3 py-2 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
const fieldCls = 'flex flex-col gap-1.5'
const labelCls = 'text-sm font-medium text-gray-700'
const hintCls = 'text-xs text-gray-500'
const errCls = 'text-xs text-red-600'

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
    <div className="space-y-4">
      {publicKey && (
        <div className={fieldCls}>
          <label className={labelCls}>SSH Public Key</label>
          <div className="flex gap-2 items-start">
            <textarea
              className={inputCls + ' font-mono text-xs bg-slate-50'}
              readOnly
              rows={3}
              value={publicKey}
            />
            <CopyButton text={publicKey} />
          </div>
          <p className={hintCls}>
            Add this as a Deploy Key to your GitHub repository (Settings → Deploy keys).
            Enable &ldquo;Allow write access&rdquo; if you want the platform to push to the fork.
          </p>
        </div>
      )}

      {canGenerate && (
        <div className={fieldCls}>
          <label className={labelCls}>Generate SSH Key</label>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="btn btn-secondary"
            >
              {generating ? 'Generating…' : publicKey ? 'Regenerate Key' : 'Generate Key'}
            </button>
            <span className={hintCls}>
              {publicKey
                ? 'Regenerating will invalidate the current key'
                : 'Generate a key pair for SSH authentication'}
            </span>
          </div>
          {error && <p className={errCls}>{error}</p>}
        </div>
      )}

      <div className={fieldCls}>
        <label className={labelCls} htmlFor="sshPrivateKeyContent">SSH private key (manual)</label>
        <textarea
          className={inputCls + ' font-mono text-xs'}
          id="sshPrivateKeyContent"
          name="sshPrivateKeyContent"
          rows={6}
          placeholder="Paste private key to upload manually"
          autoComplete="off"
        />
        <p className={hintCls}>
          Optional: Paste your own private key instead of generating one.
          Key is stored on disk with 600 permissions.
        </p>
      </div>
    </div>
  )
}
