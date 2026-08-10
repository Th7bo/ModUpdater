import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open as openZip, type Entry, type ZipFile } from 'yauzl'

const MOD_JSON_ENTRY = 'fabric.mod.json'
const EXACT_VERSION = /^\d+\.\d+(\.\d+)?$/
const LEADING_OPERATOR = /^[>=<~^\s]+/

export interface ModMetadata {
  modId: string
  modVersion: string | null
  displayName: string | null
  mcVersionsRaw: string | null
  mcVersions: string[]
}

/**
 * Normalizes a Fabric `depends.minecraft` constraint into explicit MC versions
 * (REQUIREMENTS §12.1). Clients match these by exact string, so anything we
 * can't resolve to a concrete version is dropped rather than guessed at.
 *
 * A lower bound like ">=1.21.4" yields just "1.21.4" — conservative, since
 * offering an incompatible JAR is worse than missing an update.
 */
export function normalizeMcVersions(raw: unknown): string[] {
  const candidates = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []
  const versions: string[] = []

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue

    const trimmed = candidate.trim()
    // Compound ranges (">=1.21 <1.22", "1.21 || 1.20") have no single concrete
    // answer, so we decline rather than pick a bound that may be exclusive.
    if (trimmed === '' || /\s/.test(trimmed) || trimmed.includes('||')) continue

    const stripped = trimmed.replace(LEADING_OPERATOR, '')
    if (EXACT_VERSION.test(stripped) && !versions.includes(stripped)) {
      versions.push(stripped)
    }
  }

  return versions
}

function rawMinecraftConstraint(depends: unknown): string | null {
  if (typeof depends !== 'object' || depends === null) return null
  const minecraft = (depends as Record<string, unknown>).minecraft
  if (typeof minecraft === 'string') return minecraft
  if (Array.isArray(minecraft)) return JSON.stringify(minecraft)
  return null
}

function parseModJson(contents: string): ModMetadata | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const record = parsed as Record<string, unknown>
  // Without an id there is no key to match an installed mod against, so the
  // artifact is unusable to a client even though the JAR itself is fine.
  if (typeof record.id !== 'string' || record.id === '') return null

  const depends = record.depends
  const minecraft =
    typeof depends === 'object' && depends !== null
      ? (depends as Record<string, unknown>).minecraft
      : undefined

  return {
    modId: record.id,
    modVersion: typeof record.version === 'string' ? record.version : null,
    displayName: typeof record.name === 'string' ? record.name : null,
    mcVersionsRaw: rawMinecraftConstraint(depends),
    mcVersions: normalizeMcVersions(minecraft),
  }
}

function readEntryText(zipfile: ZipFile, entry: Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error('No read stream'))
        return
      }

      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
  })
}

/**
 * Reads `fabric.mod.json` out of a mod JAR.
 *
 * Returns null for anything unusable — not a ZIP, no `fabric.mod.json`,
 * malformed JSON, no mod id. Never throws: metadata extraction must not be
 * able to fail a build (REQUIREMENTS §12.1).
 */
export function readModMetadata(jarPath: string): Promise<ModMetadata | null> {
  return new Promise((resolve) => {
    openZip(jarPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve(null)
        return
      }

      let settled = false
      const finish = (result: ModMetadata | null): void => {
        if (settled) return
        settled = true
        try {
          zipfile.close()
        } catch {
          // already closed or never opened — nothing to do
        }
        resolve(result)
      }

      zipfile.on('error', () => finish(null))
      zipfile.on('end', () => finish(null))

      zipfile.on('entry', (entry: Entry) => {
        if (entry.fileName !== MOD_JSON_ENTRY) {
          zipfile.readEntry()
          return
        }

        readEntryText(zipfile, entry)
          .then((contents) => finish(parseModJson(contents)))
          .catch(() => finish(null))
      })

      zipfile.readEntry()
    })
  })
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
