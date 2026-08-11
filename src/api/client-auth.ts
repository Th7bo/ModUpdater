import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time bearer token check for the client endpoints (REQUIREMENTS §12.4).
 *
 * Both sides are hashed first so the comparison operates on fixed-length
 * buffers — `timingSafeEqual` throws on a length mismatch, and guarding that
 * with a length check would leak the token's length.
 */
export function isAuthorized(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false

  const provided = createHash('sha256').update(header.slice('Bearer '.length)).digest()
  const target = createHash('sha256').update(expected).digest()

  return timingSafeEqual(provided, target)
}
