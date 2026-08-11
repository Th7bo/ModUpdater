import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  readModMetadata,
  normalizeMcVersions,
  hashFile,
  mcMatchMode,
  mcVersionMatches,
} from './mod-metadata'

// ─── Minimal STORED-method ZIP writer ───────────────────────────────────────
// Node has no ZIP writer and yauzl only reads, so fixtures are built here.
// This keeps the tests hermetic — no committed binaries, no `zip` on PATH.

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function zipStore(files: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)

    locals.push(local, data)
    centrals.push(central)
    offset += local.length + data.length
  }

  const centralDir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralDir, eocd])
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

let dir: string

async function writeJar(name: string, files: { name: string; content: string }[]): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, zipStore(files))
  return path
}

function modJson(extra: Record<string, unknown> = {}): { name: string; content: string } {
  return {
    name: 'fabric.mod.json',
    content: JSON.stringify({
      schemaVersion: 1,
      id: 'examplemod',
      version: '1.2.3',
      name: 'Example Mod',
      depends: { minecraft: '1.21.4' },
      ...extra,
    }),
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'modupdater-metadata-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

// ─── readModMetadata ────────────────────────────────────────────────────────

describe('readModMetadata', () => {
  it('extracts id, version, display name and MC versions', async () => {
    const jar = await writeJar('valid.jar', [modJson()])

    expect(await readModMetadata(jar)).toEqual({
      modId: 'examplemod',
      modVersion: '1.2.3',
      displayName: 'Example Mod',
      mcVersionsRaw: '1.21.4',
      mcVersions: ['1.21.4'],
    })
  })

  it('finds fabric.mod.json among other entries', async () => {
    const jar = await writeJar('multi.jar', [
      { name: 'META-INF/MANIFEST.MF', content: 'Manifest-Version: 1.0\n' },
      { name: 'com/example/Mod.class', content: 'not really bytecode' },
      modJson(),
    ])

    expect((await readModMetadata(jar))?.modId).toBe('examplemod')
  })

  it('returns null when fabric.mod.json is absent', async () => {
    const jar = await writeJar('nomod.jar', [
      { name: 'META-INF/MANIFEST.MF', content: 'Manifest-Version: 1.0\n' },
    ])

    expect(await readModMetadata(jar)).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    const jar = await writeJar('malformed.jar', [
      { name: 'fabric.mod.json', content: '{ "id": "broken", ' },
    ])

    expect(await readModMetadata(jar)).toBeNull()
  })

  it('returns null when the mod id is missing', async () => {
    const jar = await writeJar('noid.jar', [
      { name: 'fabric.mod.json', content: JSON.stringify({ version: '1.0.0' }) },
    ])

    expect(await readModMetadata(jar)).toBeNull()
  })

  it('returns null for a file that is not a ZIP', async () => {
    const path = join(dir, 'garbage.jar')
    await writeFile(path, 'this is not an archive')

    expect(await readModMetadata(path)).toBeNull()
  })

  it('returns null for a nonexistent file', async () => {
    expect(await readModMetadata(join(dir, 'missing.jar'))).toBeNull()
  })

  it('tolerates missing optional fields', async () => {
    const jar = await writeJar('minimal.jar', [
      { name: 'fabric.mod.json', content: JSON.stringify({ id: 'bare' }) },
    ])

    expect(await readModMetadata(jar)).toEqual({
      modId: 'bare',
      modVersion: null,
      displayName: null,
      mcVersionsRaw: null,
      mcVersions: [],
    })
  })

  it('resolves a wildcard to its base version and keeps the raw constraint', async () => {
    const jar = await writeJar('wildcard.jar', [
      modJson({ depends: { minecraft: '1.21.x' } }),
    ])
    const meta = await readModMetadata(jar)

    expect(meta?.mcVersionsRaw).toBe('1.21.x')
    expect(meta?.mcVersions).toEqual(['1.21'])
  })

  it('preserves the raw constraint when it cannot be normalized', async () => {
    const jar = await writeJar('unparseable.jar', [
      modJson({ depends: { minecraft: 'latest' } }),
    ])
    const meta = await readModMetadata(jar)

    expect(meta?.mcVersionsRaw).toBe('latest')
    expect(meta?.mcVersions).toEqual([])
  })

  it('handles an array of MC versions', async () => {
    const jar = await writeJar('multiver.jar', [
      modJson({ depends: { minecraft: ['1.21.4', '1.21.5'] } }),
    ])

    expect((await readModMetadata(jar))?.mcVersions).toEqual(['1.21.4', '1.21.5'])
  })
})

// ─── normalizeMcVersions ────────────────────────────────────────────────────

describe('normalizeMcVersions', () => {
  it('keeps exact versions', () => {
    expect(normalizeMcVersions('1.21.4')).toEqual(['1.21.4'])
    expect(normalizeMcVersions('1.21')).toEqual(['1.21'])
  })

  it('strips leading comparison operators', () => {
    expect(normalizeMcVersions('>=1.21.4')).toEqual(['1.21.4'])
    expect(normalizeMcVersions('~1.21.4')).toEqual(['1.21.4'])
    expect(normalizeMcVersions('^1.21')).toEqual(['1.21'])
  })

  it('unions arrays and drops duplicates', () => {
    expect(normalizeMcVersions(['1.21.4', '>=1.21.4', '1.21.5'])).toEqual(['1.21.4', '1.21.5'])
  })

  it('takes the lower bound of a bounded range', () => {
    // The form Fabric's own templates produce. The lower bound is the version
    // the JAR was built for; the exclusive upper bound names nothing anyone runs.
    expect(normalizeMcVersions('>=26.1.2 <26.2')).toEqual(['26.1.2'])
    expect(normalizeMcVersions('>=1.21 <1.22')).toEqual(['1.21'])
    expect(normalizeMcVersions('> 1.21 < 1.22')).toEqual(['1.21'])
  })

  it('declines ranges it cannot read as a single version', () => {
    expect(normalizeMcVersions('1.21 || 1.20')).toEqual([])
    expect(normalizeMcVersions('>=1.21 <=1.22 !=1.21.3')).toEqual([])
    expect(normalizeMcVersions('anything at all')).toEqual([])
  })

  it('declines unparseable input', () => {
    // "1.21.x" is handled: it resolves to base 1.21 with prefix matching, see
    // normalizeMcVersions with wildcards below.
    expect(normalizeMcVersions('*')).toEqual([])
    expect(normalizeMcVersions('')).toEqual([])
    expect(normalizeMcVersions('latest')).toEqual([])
  })

  it('ignores non-string input', () => {
    expect(normalizeMcVersions(undefined)).toEqual([])
    expect(normalizeMcVersions(null)).toEqual([])
    expect(normalizeMcVersions(42)).toEqual([])
    expect(normalizeMcVersions([1, '1.21.4', {}])).toEqual(['1.21.4'])
  })
})

// ─── hashFile ───────────────────────────────────────────────────────────────

describe('hashFile', () => {
  it('matches the SHA-256 of the file contents', async () => {
    const path = join(dir, 'hash-me.bin')
    const contents = 'the quick brown fox'
    await writeFile(path, contents)

    const expected = createHash('sha256').update(contents).digest('hex')
    expect(await hashFile(path)).toBe(expected)
  })

  it('rejects for a nonexistent file', async () => {
    await expect(hashFile(join(dir, 'missing.bin'))).rejects.toThrow()
  })
})

// ─── Minecraft version matching (§12.1) ─────────────────────────────────────

describe('mcMatchMode', () => {
  it('treats tilde and caret ranges as covering a whole line', () => {
    expect(mcMatchMode('~26.1')).toBe('prefix')
    expect(mcMatchMode('^1.21')).toBe('prefix')
  })

  it('treats an .x wildcard as covering a whole line', () => {
    expect(mcMatchMode('1.21.x')).toBe('prefix')
    expect(mcMatchMode('1.21.*')).toBe('prefix')
  })

  it('keeps plain and lower-bound constraints exact', () => {
    expect(mcMatchMode('1.21.4')).toBe('exact')
    // ">=1.21.4" says nothing about 1.22, so widening it would offer JARs that
    // may not run.
    expect(mcMatchMode('>=1.21.4')).toBe('exact')
  })

  it('widens when any element of an array is a range', () => {
    expect(mcMatchMode(JSON.stringify(['1.21.4', '~1.20']))).toBe('prefix')
    expect(mcMatchMode(JSON.stringify(['1.21.4', '1.21.5']))).toBe('exact')
  })

  it('defaults to exact for missing or unparseable input', () => {
    expect(mcMatchMode(null)).toBe('exact')
    expect(mcMatchMode(undefined)).toBe('exact')
    expect(mcMatchMode('')).toBe('exact')
    expect(mcMatchMode('[broken')).toBe('exact')
  })
})

describe('mcVersionMatches', () => {
  it('matches a patch release against a tilde range', () => {
    // The real case this was written for: SkyHanni declares ~26.1 and the
    // instance runs 26.1.2.
    expect(mcVersionMatches(['26.1'], '~26.1', '26.1.2')).toBe(true)
    expect(mcVersionMatches(['26.1'], '~26.1', '26.1')).toBe(true)
  })

  it('does not let a prefix leak into a neighbouring line', () => {
    expect(mcVersionMatches(['26.1'], '~26.1', '26.2')).toBe(false)
    expect(mcVersionMatches(['1.21'], '~1.21', '1.211')).toBe(false)
  })

  it('requires equality for exact constraints', () => {
    expect(mcVersionMatches(['1.21.4'], '1.21.4', '1.21.4')).toBe(true)
    expect(mcVersionMatches(['1.21.4'], '1.21.4', '1.21.5')).toBe(false)
  })

  it('matches any listed version', () => {
    expect(mcVersionMatches(['1.21.4', '1.21.5'], JSON.stringify(['1.21.4', '1.21.5']), '1.21.5')).toBe(true)
  })

  it('never matches when compatibility is unknown', () => {
    expect(mcVersionMatches([], null, '1.21.4')).toBe(false)
    expect(mcVersionMatches([], '~26.1', '26.1.2')).toBe(false)
  })

  it('never matches a blank target', () => {
    expect(mcVersionMatches(['1.21.4'], '1.21.4', '')).toBe(false)
  })
})

describe('normalizeMcVersions with wildcards', () => {
  it('resolves an .x wildcard to its base version', () => {
    expect(normalizeMcVersions('1.21.x')).toEqual(['1.21'])
    expect(normalizeMcVersions('~26.1')).toEqual(['26.1'])
  })
})
