import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | null
): boolean {
  if (!header) {
    return false
  }

  if (!header.startsWith('sha256=')) {
    return false
  }

  const signatureHex = header.slice('sha256='.length)
  const expectedHmac = createHmac('sha256', secret).update(rawBody).digest('hex')

  const signatureBuffer = Buffer.from(signatureHex, 'hex')
  const expectedBuffer = Buffer.from(expectedHmac, 'hex')

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer)
}
