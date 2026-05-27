import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createRateLimiter } from './rate-limiter'

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to maxPerWindow calls within the window', () => {
    const limiter = createRateLimiter(60, 60000)
    const key = '192.168.1.1'

    for (let i = 0; i < 60; i++) {
      expect(limiter(key)).toBe(true)
    }
  })

  it('rejects the call exceeding maxPerWindow within the same window', () => {
    const limiter = createRateLimiter(60, 60000)
    const key = '192.168.1.1'

    for (let i = 0; i < 60; i++) {
      limiter(key)
    }

    expect(limiter(key)).toBe(false)
  })

  it('resets counter after window expires and allows next call', () => {
    const limiter = createRateLimiter(60, 60000)
    const key = '192.168.1.1'

    for (let i = 0; i < 60; i++) {
      limiter(key)
    }
    expect(limiter(key)).toBe(false)

    vi.advanceTimersByTime(60000)

    expect(limiter(key)).toBe(true)
  })
})
