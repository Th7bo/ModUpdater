import { parseConfig } from '@/src/config/env'

type DebouncedCallback = () => void | Promise<void>

interface DebounceEntry {
  timer: NodeJS.Timeout
  callback: DebouncedCallback
}

const entries = new Map<string, DebounceEntry>()

export function debounce(key: string, callback: DebouncedCallback): void {
  const config = parseConfig()
  const delayMs = config.DEBOUNCE_MS

  const existing = entries.get(key)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(async () => {
    entries.delete(key)
    try {
      await callback()
    } catch (err) {
      console.error(`[debouncer] Error executing callback for ${key}:`, err)
    }
  }, delayMs)

  entries.set(key, { timer, callback })
}

export function cancelDebounce(key: string): void {
  const existing = entries.get(key)
  if (existing) {
    clearTimeout(existing.timer)
    entries.delete(key)
  }
}

export function hasPendingDebounce(key: string): boolean {
  return entries.has(key)
}
