import { describe, it, expect } from 'vitest'
import { _placeholder } from '@/src/config'

describe('config smoke test', () => {
  it('config module is importable', () => {
    expect(_placeholder).toBe(true)
  })
})
