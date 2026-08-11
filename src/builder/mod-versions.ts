/**
 * Ordering for mod version strings.
 *
 * Gradle does not clear `build/libs`, so one build's collected artifacts can
 * include JARs left by earlier builds — SkyOcean 1.17.1 sitting beside 1.17.2.
 * Publishing both lets a client be offered the older one, which reads as a
 * downgrade and then flip-flops: install 1.17.1, be offered 1.17.2, repeat.
 *
 * Mod versions are not reliably semver (`0.2.0-b1`, `7.44.0`, `1.17.2+26.1`), so
 * this compares the numeric parts and treats a pre-release suffix as older than
 * the same version without one, which is the convention every mod here follows.
 */

/** Strips build metadata: `1.17.2+26.1` and `1.17.2` are the same release. */
function core(version: string): string {
  return version.split('+')[0]!.trim()
}

function numericParts(version: string): number[] {
  const upToSuffix = core(version).split('-')[0]!
  return upToSuffix.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10)
    return Number.isNaN(parsed) ? 0 : parsed
  })
}

function preRelease(version: string): string {
  const parts = core(version).split('-')
  return parts.length > 1 ? parts.slice(1).join('-') : ''
}

/**
 * @returns negative if `a` is older, positive if newer, 0 if indistinguishable
 */
export function compareModVersions(a: string | null, b: string | null): number {
  if (!a || !b) return 0

  const left = numericParts(a)
  const right = numericParts(b)

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }

  const leftPre = preRelease(a)
  const rightPre = preRelease(b)

  // 0.2.0 is newer than 0.2.0-b1; two pre-releases fall back to string order.
  if (leftPre === rightPre) return 0
  if (leftPre === '') return 1
  if (rightPre === '') return -1
  return leftPre.localeCompare(rightPre)
}
