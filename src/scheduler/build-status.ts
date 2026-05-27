type BuildStatus = {
  buildId: string
  repoId: string
  repoName: string
  logPath: string
  startedAt: Date
}

const activeBuilds = new Map<string, BuildStatus>()

export function setActiveBuild(repoId: string, status: BuildStatus): void {
  activeBuilds.set(repoId, status)
}

export function clearActiveBuild(repoId: string): void {
  activeBuilds.delete(repoId)
}

export function getActiveBuild(repoId: string): BuildStatus | undefined {
  return activeBuilds.get(repoId)
}

export function getAllActiveBuilds(): BuildStatus[] {
  return Array.from(activeBuilds.values())
}
