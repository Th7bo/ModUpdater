import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open as openZip, type Entry, type ZipFile } from 'yauzl'

const MOD_JSON_ENTRY = 'fabric.mod.json'
const EXACT_VERSION = /^\d+\.\d+(\.\d+)?$/
const LEADING_OPERATOR = /^[>=<~^\s]+/
const WILDCARD_SUFFIX = /\.[x*]$/i
/**
 * Constraints that cover a whole Minecraft line rather than one release.
 *
 * `~1.21`, `^1.21` and `1.21.x` say so outright. An open lower bound like
 * `>=26.1` means more than that — every later version — but reading it as exact
 * left mods that are demonstrably running on 26.1.2 unable to be offered an
 * update at all. Covering the line is the closest safe reading: it never offers
 * a JAR for a different line, which is the failure that matters.
 */
const PREFIX_CONSTRAINT = /^(?:[~^]|>=?(?!.*<))/

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

    let trimmed = candidate.trim()
    if (trimmed === '' || trimmed.includes('||')) continue

    // A bounded range like ">=26.1.2 <26.2" is the form Fabric's own templates
    // produce, and it is precise: the lower bound is the version the JAR was
    // built for. Take that and drop the exclusive upper bound, which contributes
    // no version anyone runs. Anything else with a space is not understood.
    if (/\s/.test(trimmed)) {
      const bounded = /^(>=?)\s*(\d+\.\d+(?:\.\d+)?)\s+<\s*\d+\.\d+(?:\.\d+)?$/.exec(trimmed)
      if (!bounded) continue
      trimmed = bounded[2]!
    }

    // "1.21.x" carries the same meaning as "~1.21": the base is 1.21, and which
    // patch releases exist is decided by mcMatchMode, not by enumerating them.
    const stripped = trimmed.replace(LEADING_OPERATOR, '').replace(WILDCARD_SUFFIX, '')
    if (EXACT_VERSION.test(stripped) && !versions.includes(stripped)) {
      versions.push(stripped)
    }
  }

  return versions
}

export type McMatchMode = 'exact' | 'prefix'

/**
 * How the recorded versions should be compared against an instance's Minecraft
 * version (REQUIREMENTS §12.1).
 *
 * A tilde/caret range or an `.x` wildcard covers every patch release on that
 * line, so `~26.1` has to match an instance running 26.1.2. Enumerating those
 * patch versions is impossible — they get released later — so the manifest
 * publishes the base version plus the rule for comparing it.
 *
 * Anything else stays exact. A lower bound like ">=1.21.4" deliberately does
 * not become a prefix: it says nothing about 1.22, and offering an incompatible
 * JAR is worse than missing an update.
 */
export function mcMatchMode(raw: string | null | undefined): McMatchMode {
  if (!raw) return 'exact'

  const candidates: string[] = []
  const trimmed = raw.trim()

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        candidates.push(...parsed.filter((v): v is string => typeof v === 'string'))
      }
    } catch {
      candidates.push(trimmed)
    }
  } else {
    candidates.push(trimmed)
  }

  // One prefix constraint in the set widens the whole artifact: the versions
  // list is shared, and a narrower reading would drop a compatible build.
  return candidates.some(
    (candidate) =>
      PREFIX_CONSTRAINT.test(candidate.trim()) || WILDCARD_SUFFIX.test(candidate.trim())
  )
    ? 'prefix'
    : 'exact'
}

/** Whether an artifact declaring these versions runs on `target`. */
export function mcVersionMatches(
  mcVersions: string[],
  raw: string | null | undefined,
  target: string
): boolean {
  if (!target) return false

  if (mcMatchMode(raw) === 'prefix') {
    return mcVersions.some((version) => target === version || target.startsWith(`${version}.`))
  }

  return mcVersions.includes(target)
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
