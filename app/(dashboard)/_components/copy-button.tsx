'use client'

import { useState } from 'react'

type Props = {
  text: string
  label?: string
}

export function CopyButton({ text, label = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Failed to copy to clipboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn btn-secondary btn-sm"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
