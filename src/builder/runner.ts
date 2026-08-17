import { spawn } from 'node:child_process'

import type { LogHandle } from '@/src/logging/activity-log'
import { appendLog } from '@/src/logging/activity-log'

export type JdkVersion = '21' | '25'

export interface BuildResult {
  success: boolean
  logTail: string
  durationMs: number
}

export interface RunBuildOptions {
  logHandle?: LogHandle
  jdkVersion?: JdkVersion
}

const MAX_LOG_LINES = 50

function getJavaHome(version: JdkVersion): string | null {
  if (process.platform === 'win32') {
    return null
  }
  return `/usr/lib/jvm/java-${version}-openjdk`
}

export function getAvailableJdkVersions(): JdkVersion[] {
  return ['21', '25']
}

/**
 * Split a per-repo build task override into argv elements.
 *
 * The override is free text from the web UI (REQUIREMENTS §5), so it can carry
 * flags and properties alongside the task name — `build -x test`,
 * `-Pmc=1.21 chiseledBuild`. Passing the whole string as one argv element makes
 * Gradle read it as a single task name, which it never finds. Quoted runs stay
 * together so property values with spaces survive.
 */
export function parseTaskArgs(task: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  // Tracks a quoted section, so an empty `""` still yields an empty argument.
  let quoted = false

  for (const char of task) {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      quote = char
      quoted = true
    } else if (/\s/.test(char)) {
      if (quoted || current.length > 0) {
        args.push(current)
        current = ''
        quoted = false
      }
    } else {
      current += char
    }
  }

  if (quoted || current.length > 0) {
    args.push(current)
  }

  return args
}

export function runBuild(
  repoDir: string,
  task: string,
  options: RunBuildOptions = {}
): Promise<BuildResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const outputLines: string[] = []
    const { logHandle, jdkVersion = '21' } = options

    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'

    const env = { ...process.env }
    const javaHome = getJavaHome(jdkVersion)
    if (javaHome) {
      env.JAVA_HOME = javaHome
      env.PATH = `${javaHome}/bin:${env.PATH}`
    }

    const proc = spawn(gradlew, parseTaskArgs(task), {
      cwd: repoDir,
      shell: process.platform === 'win32',
      env,
    })

    const collectOutput = async (data: Buffer) => {
      const text = data.toString()
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.length > 0) {
          outputLines.push(line)
          if (logHandle) {
            try {
              await appendLog(logHandle, line)
            } catch {
              // continue even if log write fails
            }
          }
        }
      }
    }

    proc.stdout.on('data', collectOutput)
    proc.stderr.on('data', collectOutput)

    proc.on('error', async (err) => {
      const durationMs = Date.now() - startTime
      if (logHandle) {
        try {
          await appendLog(logHandle, `ERROR: ${err.message}`)
        } catch {
          // continue even if log write fails
        }
      }
      resolve({
        success: false,
        logTail: err.message,
        durationMs,
      })
    })

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime
      const tail = outputLines.slice(-MAX_LOG_LINES).join('\n')
      resolve({
        success: code === 0,
        logTail: tail,
        durationMs,
      })
    })
  })
}
