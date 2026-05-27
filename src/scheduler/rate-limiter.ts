interface RateLimitEntry {
  count: number
  windowStart: number
}

export function createRateLimiter(
  maxPerWindow: number,
  windowMs: number
): (key: string) => boolean {
  const entries = new Map<string, RateLimitEntry>()

  return (key: string): boolean => {
    const now = Date.now()
    const entry = entries.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      entries.set(key, { count: 1, windowStart: now })
      return true
    }

    if (entry.count < maxPerWindow) {
      entry.count++
      return true
    }

    return false
  }
}
