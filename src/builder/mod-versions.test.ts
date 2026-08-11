import { describe, it, expect } from 'vitest'

import { compareModVersions } from './mod-versions'

describe('compareModVersions', () => {
  const older = (a: string, b: string) => expect(compareModVersions(a, b)).toBeLessThan(0)
  const newer = (a: string, b: string) => expect(compareModVersions(a, b)).toBeGreaterThan(0)
  const same = (a: string, b: string) => expect(compareModVersions(a, b)).toBe(0)

  it('orders patch releases', () => {
    // The case that offered a downgrade: both JARs came from one build because
    // Gradle left the older one in build/libs.
    older('1.17.1', '1.17.2')
    newer('1.17.2', '1.17.1')
  })

  it('orders across minor and major', () => {
    older('1.9.0', '1.10.0')
    older('1.21.4', '2.0.0')
    newer('7.44.0', '7.43.9')
  })

  it('treats a pre-release as older than the release', () => {
    older('0.2.0-b1', '0.2.0')
    older('0.2.0-b1', '0.2.1')
    newer('0.2.1', '0.2.0-b1')
  })

  it('orders two pre-releases of the same version', () => {
    older('0.2.0-b1', '0.2.0-b2')
  })

  it('ignores build metadata', () => {
    same('1.17.2+26.1', '1.17.2')
    older('1.17.1+26.1', '1.17.2+26.1')
  })

  it('treats equal versions as equal', () => {
    same('7.44.0', '7.44.0')
  })

  it('handles differing segment counts', () => {
    same('1.21', '1.21.0')
    older('1.21', '1.21.1')
  })

  it('does not order what it cannot read', () => {
    same('latest', 'nightly')
    same(null, '1.0.0')
    same('1.0.0', null)
  })
})
