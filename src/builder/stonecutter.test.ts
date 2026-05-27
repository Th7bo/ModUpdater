import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}))

import { access } from 'node:fs/promises'

import { detectStonecutter, selectBuildTask } from './stonecutter'

describe('detectStonecutter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when stonecutter.gradle exists in repo root', async () => {
    vi.mocked(access).mockResolvedValue(undefined)

    const result = await detectStonecutter('/repos/test')

    expect(result).toBe(true)
    expect(access).toHaveBeenCalledWith(join('/repos/test', 'stonecutter.gradle'))
  })

  it('returns false when stonecutter.gradle is absent', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

    const result = await detectStonecutter('/repos/test')

    expect(result).toBe(false)
  })
})

describe('selectBuildTask', () => {
  it('returns chiseledBuild when hasStonecutter is true and no custom task', () => {
    expect(selectBuildTask(true, undefined)).toBe('chiseledBuild')
  })

  it('returns build when hasStonecutter is false and no custom task', () => {
    expect(selectBuildTask(false, undefined)).toBe('build')
  })

  it('returns custom task when provided (stonecutter true)', () => {
    expect(selectBuildTask(true, 'myTask')).toBe('myTask')
  })

  it('returns custom task when provided (stonecutter false)', () => {
    expect(selectBuildTask(false, 'myTask')).toBe('myTask')
  })
})
