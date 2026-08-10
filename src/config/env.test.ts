import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { parseConfig } from '@/src/config/env'

const validEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  AUTH_SECRET: 'super-secret-value-for-testing-32-chars!!',
  DISCORD_CLIENT_ID: 'test-discord-client-id',
  DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
  DISCORD_BOT_TOKEN: 'test-discord-bot-token',
}

describe('parseConfig', () => {
  it('accepts a fully valid env object and resolves typed fields', () => {
    const config = parseConfig(validEnv)
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL)
    expect(config.DISCORD_BOT_TOKEN).toBe(validEnv.DISCORD_BOT_TOKEN)
    expect(typeof config.BUILD_CONCURRENCY).toBe('number')
    expect(typeof config.DEBOUNCE_MS).toBe('number')
  })

  it('leaves CLIENT_API_TOKEN undefined when unset', () => {
    expect(parseConfig(validEnv).CLIENT_API_TOKEN).toBeUndefined()
  })

  it('reads CLIENT_API_TOKEN when set', () => {
    const config = parseConfig({ ...validEnv, CLIENT_API_TOKEN: 'a-client-token' })
    expect(config.CLIENT_API_TOKEN).toBe('a-client-token')
  })

  it('throws ZodError when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _, ...env } = validEnv
    expect(() => parseConfig(env)).toThrow(ZodError)
  })

  it('throws ZodError when AUTH_SECRET is missing', () => {
    const { AUTH_SECRET: _, ...env } = validEnv
    expect(() => parseConfig(env)).toThrow(ZodError)
  })

  it('throws ZodError when DISCORD_CLIENT_ID is missing', () => {
    const { DISCORD_CLIENT_ID: _, ...env } = validEnv
    expect(() => parseConfig(env)).toThrow(ZodError)
  })

  it('throws ZodError when DISCORD_CLIENT_SECRET is missing', () => {
    const { DISCORD_CLIENT_SECRET: _, ...env } = validEnv
    expect(() => parseConfig(env)).toThrow(ZodError)
  })

  it('throws ZodError when DISCORD_BOT_TOKEN is missing', () => {
    const { DISCORD_BOT_TOKEN: _, ...env } = validEnv
    expect(() => parseConfig(env)).toThrow(ZodError)
  })

  it('defaults BUILD_CONCURRENCY to 2 when absent', () => {
    const config = parseConfig(validEnv)
    expect(config.BUILD_CONCURRENCY).toBe(2)
  })

  it('defaults DEBOUNCE_MS to 60000 when absent', () => {
    const config = parseConfig(validEnv)
    expect(config.DEBOUNCE_MS).toBe(60000)
  })

  it('throws ZodError for a non-numeric BUILD_CONCURRENCY', () => {
    expect(() =>
      parseConfig({ ...validEnv, BUILD_CONCURRENCY: 'not-a-number' })
    ).toThrow(ZodError)
  })

  it('defaults REPOS_DIR to ./data/repos when absent', () => {
    const config = parseConfig(validEnv)
    expect(config.REPOS_DIR).toBe('./data/repos')
  })

  it('uses custom REPOS_DIR when provided', () => {
    const config = parseConfig({ ...validEnv, REPOS_DIR: '/custom/repos/path' })
    expect(config.REPOS_DIR).toBe('/custom/repos/path')
  })

  it('defaults LOG_DIR to ./data/logs when absent', () => {
    const config = parseConfig(validEnv)
    expect(config.LOG_DIR).toBe('./data/logs')
  })

  it('uses custom LOG_DIR when provided', () => {
    const config = parseConfig({ ...validEnv, LOG_DIR: '/custom/logs/path' })
    expect(config.LOG_DIR).toBe('/custom/logs/path')
  })
})
