import { spawn } from 'node:child_process'

export interface BuildResult {
  success: boolean
  logTail: string
  durationMs: number
}

const MAX_LOG_LINES = 50

export function runBuild(repoDir: string, task: string): Promise<BuildResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const outputLines: string[] = []

    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'

    const proc = spawn(gradlew, [task], {
      cwd: repoDir,
      shell: process.platform === 'win32',
    })

    const collectOutput = (data: Buffer) => {
      const text = data.toString()
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.length > 0) {
          outputLines.push(line)
        }
      }
    }

    proc.stdout.on('data', collectOutput)
    proc.stderr.on('data', collectOutput)

    proc.on('error', (err) => {
      const durationMs = Date.now() - startTime
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
