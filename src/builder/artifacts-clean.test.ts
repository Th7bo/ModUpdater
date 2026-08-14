import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cleanArtifactDirs, collectArtifacts } from './artifacts'

/**
 * Real files, not mocks: this function deletes things, and the property that
 * matters — that it removes JARs and nothing else — is about the filesystem.
 *
 * The sibling artifacts.test.ts mocks `node:fs/promises` module-wide, so these
 * live in their own file.
 */
describe('cleanArtifactDirs', () => {
  let repoDir: string

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'modupdater-clean-'))
  })

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true })
  })

  async function writeJar(dir: string, name: string) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, name), 'not really a jar')
  }

  it('removes JARs from the root project', async () => {
    const libs = join(repoDir, 'build', 'libs')
    await writeJar(libs, 'mod-1.0.0.jar')

    const removed = await cleanArtifactDirs(repoDir)

    expect(removed).toEqual([libs])
    await expect(collectArtifacts(repoDir)).resolves.toEqual([])
  })

  it('removes JARs from subprojects and Stonecutter version nodes', async () => {
    await writeJar(join(repoDir, 'build', 'libs'), 'root-1.0.0.jar')
    await writeJar(join(repoDir, 'core', 'build', 'libs'), 'core-1.0.0.jar')
    await writeJar(join(repoDir, 'versions', '26.1.2', 'build', 'libs'), 'mod-1.0.0+26.1.2.jar')
    await writeJar(join(repoDir, 'versions', '26.2', 'build', 'libs'), 'mod-1.0.0+26.2.jar')

    // Every place the collector looks is a place the cleaner clears — if these
    // two ever disagree, a stale JAR survives into the next build.
    expect(await collectArtifacts(repoDir)).toHaveLength(4)

    await cleanArtifactDirs(repoDir)

    await expect(collectArtifacts(repoDir)).resolves.toEqual([])
  })

  it('leaves everything that makes the next build incremental', async () => {
    // The point of not running `gradlew clean`. These are the expensive ones:
    // build/libs is kilobytes, build/kotlin is megabytes.
    const node = join(repoDir, 'versions', '26.1.2', 'build')
    await writeJar(join(node, 'libs'), 'mod-1.0.0.jar')

    await mkdir(join(node, 'classes', 'kotlin', 'main'), { recursive: true })
    await writeFile(join(node, 'classes', 'kotlin', 'main', 'Mod.class'), 'compiled')
    await mkdir(join(node, 'kotlin'), { recursive: true })
    await writeFile(join(node, 'kotlin', 'incremental-state'), 'cache')
    await mkdir(join(node, 'loom-cache'), { recursive: true })
    await writeFile(join(node, 'loom-cache', 'minecraft.jar.marker'), 'cache')
    await mkdir(join(node, 'stonecutter-cache'), { recursive: true })
    await writeFile(join(node, 'stonecutter-cache', 'generated'), 'sources')

    await cleanArtifactDirs(repoDir)

    await expect(readFile(join(node, 'classes', 'kotlin', 'main', 'Mod.class'), 'utf8'))
      .resolves.toBe('compiled')
    await expect(readFile(join(node, 'kotlin', 'incremental-state'), 'utf8')).resolves.toBe('cache')
    await expect(readFile(join(node, 'loom-cache', 'minecraft.jar.marker'), 'utf8')).resolves.toBe('cache')
    await expect(readFile(join(node, 'stonecutter-cache', 'generated'), 'utf8')).resolves.toBe('sources')
    await expect(readdir(join(repoDir, 'versions', '26.1.2', 'build'))).resolves.toContain('classes')
  })

  it('clears the leftover that caused the downgrades', async () => {
    // SkyOcean bumped 1.17.1 -> 1.17.2. Gradle deletes only outputs it still
    // tracks, so the old filename stayed, both were collected, and the platform
    // offered the older build as though it were current.
    const libs = join(repoDir, 'build', 'libs')
    await writeJar(libs, 'SkyOcean-1.17.1-26.1.jar')

    await cleanArtifactDirs(repoDir)
    await writeJar(libs, 'SkyOcean-1.17.2-26.1.jar')

    const collected = await collectArtifacts(repoDir)

    expect(collected).toHaveLength(1)
    expect(collected[0]).toContain('SkyOcean-1.17.2-26.1.jar')
  })

  it('removes source and dev JARs too, which collection only filtered out', async () => {
    // Excluded from collection, but they still accumulate, and the directory is
    // being emptied rather than pruned.
    const libs = join(repoDir, 'build', 'libs')
    await writeJar(libs, 'mod-1.0.0.jar')
    await writeJar(libs, 'mod-1.0.0-sources.jar')
    await writeJar(libs, 'mod-1.0.0-dev.jar')

    await cleanArtifactDirs(repoDir)

    await expect(readdir(libs).catch(() => 'gone')).resolves.toBe('gone')
  })

  it('covers the layouts of the repos the platform actually builds', async () => {
    // Sidequest's shape: a root project, eleven flat subprojects, and Stonecutter
    // version nodes — with the root holding copies of the node JARs under the
    // same filenames, which is why collectArtifacts alone cannot prove coverage
    // (dedup drops the duplicates before you can see which directory they came
    // from).
    const dirs = [
      join(repoDir, 'build', 'libs'),
      join(repoDir, 'ui-api', 'build', 'libs'),
      join(repoDir, 'platform-core', 'build', 'libs'),
      join(repoDir, 'versions', '26.1.2', 'build', 'libs'),
      join(repoDir, 'versions', '26.2', 'build', 'libs'),
    ]
    for (const dir of dirs) await writeJar(dir, 'Sidequest-1.0.0.jar')

    const removed = await cleanArtifactDirs(repoDir)

    expect(new Set(removed)).toEqual(new Set(dirs))
    for (const dir of dirs) {
      await expect(readdir(dir).catch(() => 'gone')).resolves.toBe('gone')
    }
  })

  it('does not reach a nested subproject, and neither does collection', async () => {
    // A known boundary, not an oversight: Gradle's include("a:b") lives in a/b/.
    // What matters is that the two agree — a directory collected but not cleaned
    // is how a stale JAR survives. Missed by both means no artifacts, which is
    // visible, rather than stale ones, which are not.
    await writeJar(join(repoDir, 'a', 'b', 'build', 'libs'), 'nested-1.0.0.jar')

    expect(await cleanArtifactDirs(repoDir)).toEqual([])
    expect(await collectArtifacts(repoDir)).toEqual([])
  })

  it('says nothing was removed when there is nothing built yet', async () => {
    await expect(cleanArtifactDirs(repoDir)).resolves.toEqual([])
  })

  it('does not fail on a repo directory that does not exist', async () => {
    await expect(cleanArtifactDirs(join(repoDir, 'nope'))).resolves.toEqual([])
  })

  it('ignores a file where a build directory would be', async () => {
    await mkdir(join(repoDir, 'build'), { recursive: true })
    await writeFile(join(repoDir, 'build', 'libs'), 'a file, not a directory')

    await expect(cleanArtifactDirs(repoDir)).resolves.toEqual([])
    await expect(readFile(join(repoDir, 'build', 'libs'), 'utf8'))
      .resolves.toBe('a file, not a directory')
  })
})
