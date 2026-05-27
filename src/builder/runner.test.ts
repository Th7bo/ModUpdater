import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockSpawn = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

import { runBuild } from './runner'

function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  return proc
}

describe('runBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns success: true when exit code is 0', async () => {
    const mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)

    const promise = runBuild('/repos/test', 'build')

    mockProc.stdout.emit('data', Buffer.from('BUILD SUCCESSFUL\n'))
    mockProc.emit('close', 0)

    const result = await promise

    expect(result.success).toBe(true)
    expect(result.logTail).toContain('BUILD SUCCESSFUL')
  })

  it('returns success: false when exit code is non-zero', async () => {
    const mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)

    const promise = runBuild('/repos/test', 'build')

    mockProc.stderr.emit('data', Buffer.from('BUILD FAILED\n'))
    mockProc.emit('close', 1)

    const result = await promise

    expect(result.success).toBe(false)
    expect(result.logTail).toContain('BUILD FAILED')
  })

  it('limits logTail to last 50 lines when output exceeds 200 lines', async () => {
    const mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)

    const promise = runBuild('/repos/test', 'build')

    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`)
    mockProc.stdout.emit('data', Buffer.from(lines.join('\n') + '\n'))
    mockProc.emit('close', 0)

    const result = await promise

    const outputLines = result.logTail.split('\n')
    expect(outputLines.length).toBe(50)
    expect(outputLines[0]).toBe('Line 151')
    expect(outputLines[49]).toBe('Line 200')
  })

  it('spawns ./gradlew with the task as argument in the specified cwd', async () => {
    const mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)

    const promise = runBuild('/repos/my-project', 'chiseledBuild')

    mockProc.emit('close', 0)
    await promise

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('gradlew'),
      ['chiseledBuild'],
      expect.objectContaining({ cwd: '/repos/my-project' })
    )
  })

  it('returns success: false with error message when spawn emits error', async () => {
    const mockProc = createMockProcess()
    mockSpawn.mockReturnValue(mockProc)

    const promise = runBuild('/repos/test', 'build')

    const error = new Error('spawn ENOENT')
    mockProc.emit('error', error)

    const result = await promise

    expect(result.success).toBe(false)
    expect(result.logTail).toBe('spawn ENOENT')
  })
})
