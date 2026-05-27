# Phase 2 — Core CI/CD Pipeline

**Scope:** 2–3 sessions  
**Branch:** `phase-2-pipeline`  
**Goal:** Implement the full automated pipeline for both upstream and fork repos (§4.2.2 path only — user push via webhook) end-to-end: SSH private key storage, change detection via polling and webhooks, debounce queuing, Gradle build execution (Stonecutter included), artifact collection, and Discord delivery. Rebase logic (§4.2.1) is deferred to Phase 3.

---

## Decisions (resolved before implementation)

| # | Decision |
|---|---|
| Q1 | Add `REPOS_DIR=./data/repos` to env config and Docker volume. |
| Q2 | Scheduler runs inside the Next.js process, started from `instrumentation.ts`. Single-worker deployment, so duplicate-poll risk is acceptable. |
| Q3 | The platform does **not** generate SSH key pairs. The user generates their own key pair externally, registers the public key as a GitHub Deploy Key on the fork, and pastes the private key into the web UI. The platform writes the private key to `${SSH_KEYS_DIR}/repo-<id>.pem` with `600` permissions, stores the path in `repos.ssh_private_key_path`, and uses it for all git operations on that repo. Fork repos (§4.2.2 webhook path) are in scope this phase. |
| Q4 | The Dockerfile runner stage must install a JDK. Use `ARG JAVA_VERSION=21` so callers can override at build time (`docker build --build-arg JAVA_VERSION=25 .`). No pinned default beyond the ARG. |
| Q5 | Simple in-process rate limiter on the webhook endpoint: max 60 requests per source IP per minute; excess returns 429. |

---

## Tasks

---

### Task 1 — Env config: REPOS_DIR (§10)

**Goal:** Add `REPOS_DIR` to the env schema so every subsequent task that needs to store or read local repo clones has a single, validated source of truth for the path.

**Source:** §10 (persistence — local clone storage)

**Files to create / modify:**
- `src/config/env.ts` — add `REPOS_DIR: z.string().default('./data/repos')`
- `.env.example` — add `REPOS_DIR=./data/repos` with a one-line comment
- `docker-compose.yml` — add `./data/repos:/app/data/repos` to the `app` service volumes (commented out until the app service is re-added)

**Tests to write:**  
Extend `src/config/env.test.ts`:
- `REPOS_DIR` absent → defaults to `'./data/repos'`
- `REPOS_DIR` set to a custom value → that value is returned

**Done:** Both new tests pass. `pnpm typecheck` exits 0.

---

### Task 2 — Webhook endpoint with signature validation and rate limiting (§9)

**Goal:** Implement `POST /api/webhooks/[repoId]`. Validate the `X-Hub-Signature-256` header using HMAC-SHA256 before any processing — an unvalidated payload must never reach the build queue. Apply an in-process rate limiter (60 req/min per IP; 429 on excess). On a valid payload, call a build-trigger stub (implemented fully in Task 9). Return 202 on success, 400 if the repo has no webhook secret configured, 401 on bad signature, 429 on rate-limit excess.

**Source:** §9 (endpoint, `X-Hub-Signature-256` validation), CLAUDE.md §Critical behaviors (validation before any action), §Security defaults (signature check, rate limit)

**Files to create:**
- `src/git/webhook-validation.ts` — `verifySignature(secret: string, rawBody: string, header: string | null): boolean`; uses Node.js `crypto.timingSafeEqual` — no external library
- `src/scheduler/rate-limiter.ts` — `createRateLimiter(maxPerWindow: number, windowMs: number): (key: string) => boolean`; in-process `Map`-based counter; returns `false` when the key is over limit
- `app/api/webhooks/[repoId]/route.ts` — POST handler: rate-check → body read → repo lookup → `verifySignature` → build-trigger stub → 202

**Tests to write (`src/git/webhook-validation.test.ts`):**
- Correct secret + unmodified body → `true`
- Correct secret + body with one character changed → `false`
- Wrong secret, otherwise valid → `false`
- `null` header (missing) → `false`
- Header without `sha256=` prefix → `false`

**Tests to write (`src/scheduler/rate-limiter.test.ts`):** Use `vi.useFakeTimers`.
- 60 calls within the window → all return `true`
- 61st call within the same window → returns `false`
- After window expires, counter resets and next call returns `true`

**Done:** All eight tests pass. No processing occurs before signature validation. `pnpm typecheck` exits 0.

---

### Task 3 — Git helpers: upstream clone, pull, and commit detection (§4.1)

**Goal:** Implement `simple-git`–based helpers for upstream (non-SSH) repos: clone if absent, fetch latest, read HEAD SHA, and return commits introduced since a stored hash. These are the only functions that touch `simple-git` for upstream operations.

**Source:** §4.1 (clone/pull latest, detect new commits on tracked branch), §10 (idempotency — no build if `lastCommitHash` unchanged), CLAUDE.md §Tech stack (simple-git; no raw shell calls)

**Files to create:**
- `src/git/repo-sync.ts` — exports:
  - `ensureCloned(gitUrl: string, dir: string, sshKeyPath?: string): Promise<void>` — clones if `dir` is not a git repo; fetches if it is; passes `sshKeyPath` to the git SSH command when provided (covered fully in Task 4)
  - `fetchLatest(dir: string, branch: string, sshKeyPath?: string): Promise<void>`
  - `getHeadHash(dir: string, branch: string): Promise<string>`
  - `getNewCommits(dir: string, since: string, branch: string): Promise<Commit[]>` — ordered oldest-first; `Commit = { hash: string; author: string; message: string; date: Date }`

**Tests to write (`src/git/repo-sync.test.ts`):** Mock `simple-git` via `vi.mock('simple-git')`.
- `ensureCloned` calls `git.clone` when the directory does not contain a git repo; calls `git.fetch` when it does
- `getHeadHash` parses and returns the SHA from `git.revparse`
- `getNewCommits` returns commits after `since` in correct order
- `getNewCommits` with `since === HEAD` returns `[]` (idempotency base case)

**Done:** All four tests pass. No raw `child_process` or shell strings for git operations. `pnpm typecheck` exits 0.

---

### Task 4 — SSH private key storage and fork-mode git helpers (§8, §4.2)

**Goal:** Accept a pasted SSH private key from the web UI, write it to `${SSH_KEYS_DIR}/repo-<id>.pem` with `600` permissions, and store the path in `repos.ssh_private_key_path`. Extend the git helpers from Task 3 to authenticate via the stored key when the field is set. Add the SSH key textarea to the repo form (write-only: accepted on submit, never rendered back). This task covers the security-sensitive key storage path — verify `600` permissions in tests.

**Source:** §8 (private key storage, 600 permissions, use for clone/pull/push on fork), §4.2 (fork repos need SSH authentication), CLAUDE.md §Critical behaviors (600 permissions), §Asking for confirmation (SSH key storage logic is sensitive)

**Files to create / modify:**
- `src/git/ssh-keys.ts` — `storeSshKey(repoId: string, keyContent: string, keysDir: string): Promise<string>` — writes to `<keysDir>/repo-<repoId>.pem`, sets mode `0o600`, returns the absolute path; `removeSshKey(keyPath: string): Promise<void>` — called on repo deletion
- `src/git/repo-sync.ts` — (already accepts `sshKeyPath?`) — when provided, sets `GIT_SSH_COMMAND=ssh -i <path> -o StrictHostKeyChecking=no -o BatchMode=yes` for the `simpleGit` instance via its `env` option
- `src/config/repo-schema.ts` — add `sshPrivateKeyContent: z.string().optional()` to `UpdateRepoSchema` (not `CreateRepoSchema` — key is added after repo creation); this field is handled specially by the server action and never written to the database
- `app/(dashboard)/actions.ts` — `updateRepoAction`: when `sshPrivateKeyContent` is present in the parsed data, call `storeSshKey` and set `sshPrivateKeyPath` in the DB patch before calling `updateRepo`; when a repo is deleted, call `removeSshKey` if `sshPrivateKeyPath` is set
- `app/(dashboard)/_components/repo-form.tsx` — add SSH private key `<textarea>` (type-hidden/write-only, no `defaultValue`, placeholder "Paste private key to update"); only shown when `defaultValues?.mode === 'fork'` or always visible and optional

**Tests to write (`src/git/ssh-keys.test.ts`):**
- `storeSshKey` creates the file at the expected path with the provided content
- The written file has mode `0o600` (octal) — assert using `fs.stat` result
- `storeSshKey` called twice for the same `repoId` overwrites the existing file (still `0o600`)
- `removeSshKey` deletes the file; calling it on a non-existent path does not throw

**Done:** All four tests pass. A private key written by `storeSshKey` is never readable by group or world (mode `0600` verified in tests). `pnpm typecheck` exits 0. The SSH textarea in the UI submits correctly and the path is persisted to the database.

---

### Task 5 — Gradle build runner + Dockerfile JDK (§5.1, §5.2, §5.5)

**Goal:** Spawn `./gradlew <task>` inside a local repo directory, stream and capture output, and return a structured result. Update the Dockerfile runner stage to install a JDK at a configurable version. `runBuild` must never throw — all failure modes are encoded in the return value.

`child_process.spawn` is the correct tool here: Gradle is an external process and has no Node.js library equivalent. This is not a git-operation substitute.

**Source:** §5.1–§5.2 (use `./gradlew` wrapper, `./gradlew build`), §5.5 (on failure: capture last ~50 lines of output)

**Files to create / modify:**
- `src/builder/runner.ts` — `runBuild(repoDir: string, task: string): Promise<BuildResult>` where `BuildResult = { success: boolean; logTail: string; durationMs: number }`; captures stdout + stderr interleaved; `logTail` is the last 50 lines; replaces the stub in `src/builder/index.ts`
- `Dockerfile` — add `ARG JAVA_VERSION=21` in the runner stage; install via `apk add --no-cache openjdk${JAVA_VERSION}-jre-headless` (Alpine) or equivalent; no pinned default beyond the ARG value

**Tests to write (`src/builder/runner.test.ts`):** Mock `child_process.spawn`.
- Exit code 0 → `{ success: true, logTail: … }`
- Non-zero exit code → `{ success: false, logTail: … }`
- Output of 200 lines → `logTail` contains exactly the last 50 lines
- The spawned executable is `./gradlew` with the task as the first argument, cwd set to `repoDir`
- `spawn` emitting an `error` event (e.g. `ENOENT`) → `{ success: false, logTail: <error message> }`, no throw

**Done:** All five tests pass. `runBuild` is exported and typed with no `any`. `pnpm typecheck` exits 0.

---

### Task 6 — Stonecutter detection + artifact collection (§5.3, §5.4)

**Goal:** Detect whether a repo uses Stonecutter and select the correct Gradle task. After a build, collect qualifying JARs from `build/libs/` and all sub-project `build/libs/` directories, excluding `-sources.jar` and `-dev.jar` variants.

**Source:** §5.3 (check for `stonecutter.gradle`; use `chiseledBuild` if present), §5.4 (scan `build/libs/` recursively; exclude `-sources` and `-dev` JARs), CLAUDE.md §Critical behaviors (scan sub-project dirs; never include `-sources` or `-dev` JARs)

**Files to create:**
- `src/builder/stonecutter.ts` — `detectStonecutter(repoDir: string): Promise<boolean>`; `selectBuildTask(hasStonecutter: boolean, customTask?: string | null): string`
- `src/builder/artifacts.ts` — `collectArtifacts(repoDir: string): Promise<string[]>` — returns absolute paths of qualifying JARs; scans both `<repoDir>/build/libs/` and `<repoDir>/*/build/libs/`

**Tests to write (`src/builder/stonecutter.test.ts`):** Mock `node:fs/promises`.
- `stonecutter.gradle` in repo root → `detectStonecutter` returns `true`; absent → `false`
- `selectBuildTask(true, undefined)` → `'chiseledBuild'`
- `selectBuildTask(false, undefined)` → `'build'`
- `selectBuildTask(true, 'myTask')` → `'myTask'` (custom always wins)
- `selectBuildTask(false, 'myTask')` → `'myTask'`

**Tests to write (`src/builder/artifacts.test.ts`):** Mock the filesystem.
- Standard layout: `build/libs/mod-1.0.jar` collected; `build/libs/mod-1.0-sources.jar` excluded; `build/libs/mod-1.0-dev.jar` excluded
- Multi-project layout: `1.21/build/libs/mod+1.21.jar` and `1.20/build/libs/mod+1.20.jar` both collected
- No `build/libs/` present → returns `[]`, no throw

**Done:** All eight tests pass. Both areas listed in CLAUDE.md §Testing (Stonecutter detection, artifact collection) are covered. `pnpm typecheck` exits 0.

---

### Task 7 — Discord client + notification formatting (§6)

**Goal:** Initialise the `discord.js` client lazily (not at module load time) and implement `sendSuccessNotification` and `sendFailureNotification`. JAR attachments exceeding Discord's 25 MB limit fall back to a text link in the embed rather than throwing.

**Source:** §6.1–§6.2 (single bot token, per-repo channel ID), §6.3 (success: embed + commit list + JAR attachments), §6.4 (failure: embed + log tail + commits), §6.5 (25 MB attachment limit → text fallback)

**Files to create / modify:**
- `src/discord/client.ts` — `getDiscordClient(): Client` — lazy singleton; logs in once with `DISCORD_BOT_TOKEN`; replaces the stub in `src/discord/index.ts`
- `src/discord/notifications.ts` — `sendSuccessNotification(channelId: string, repo: PublicRepo, commits: Commit[], artifactPaths: string[]): Promise<void>`; `sendFailureNotification(channelId: string, repo: PublicRepo, commits: Commit[], logTail: string): Promise<void>`

**Tests to write (`src/discord/notifications.test.ts`):** Mock the `discord.js` `Client`; stub `channels.fetch` to return a mock `TextChannel`.
- `sendSuccessNotification` sends an embed containing repo name, `gitUrl`, branch, and all commit hashes + messages
- Each artifact path within 25 MB is passed as an `AttachmentBuilder`
- An artifact whose `fs.stat` size exceeds 25 MB is omitted from attachments and mentioned as a link in the embed
- `sendFailureNotification` sends an embed containing `logTail` as a code block

**Done:** All four tests pass. No real Discord connection required. `pnpm typecheck` exits 0.

---

### Task 8 — Build-run query helpers (§5.5, §10)

**Goal:** Provide the typed Drizzle query helpers for the `build_runs` table. The pipeline in Task 9 is the only caller; nothing else writes build history directly.

**Source:** §5.5 (persist build result, log tail, artifact paths), §7 sub-section 6.3 (last build status, link to log), §10 (build history in DB)

**Files to create:**
- `src/db/queries/build-runs.ts` — exports: `createBuildRun(db, data): Promise<BuildRun>`; `listBuildRuns(db, repoId, limit?: number): Promise<BuildRun[]>`; `getLatestBuildRun(db, repoId): Promise<BuildRun | null>`

**Tests to write (`src/db/queries/build-runs.test.ts`):** Use the same real-PG test database as the existing repo query tests.
- `createBuildRun` inserts a row and returns the full record including generated `id`
- `listBuildRuns` returns runs for the specified repo in descending `started_at` order and excludes runs for other repos
- `getLatestBuildRun` returns the most-recent run; returns `null` when none exist

**Done:** All three tests pass against a real PostgreSQL instance. `pnpm typecheck` exits 0.

---

### Task 9 — Pipeline wiring, polling scheduler, and fork webhook path (§4.1, §4.2, §5, §6, §10)

**Goal:** Connect all previous tasks into a single `triggerBuild(repoId)` function and wire it to both the debouncer and the polling scheduler. Handle both upstream repos (fetch + commit detection) and fork repos (fetch via SSH key — §4.2.2). On completion, persist a `buildRuns` row and update `repos.lastBuildStatus`, `repos.lastBuildAt`, and `repos.lastCommitHash`. Start all polling-mode repo pollers from `instrumentation.ts`. Wire the manual "Trigger build" button in the web UI.

**Source:** §4.1 (clone/pull → build → deliver; idempotency — skip if `lastCommitHash` unchanged), §4.2.2 (fork webhook: pull latest via SSH → build), §5 (full build pipeline), §6 (deliver to Discord), §7 sub-section 6.3 (manual trigger, build status visible in list), §10 (debounce, concurrency cap, idempotency), CLAUDE.md §Critical behaviors (concurrency cap, debounce resets)

**Files to create / modify:**
- `src/scheduler/pipeline.ts` — `triggerBuild(repoId: string): Promise<void>`:
  1. Fetch repo config from DB
  2. `ensureCloned(gitUrl, dir, sshKeyPath?)` — uses SSH key if `sshPrivateKeyPath` is set (fork repos)
  3. `fetchLatest(dir, branch, sshKeyPath?)`
  4. `getHeadHash` → compare to `repo.lastCommitHash`; return early if unchanged (idempotency)
  5. `getNewCommits` since stored hash
  6. `detectStonecutter` → `selectBuildTask`
  7. Enqueue on build queue (`createBuildQueue` from Task 4, singleton instance)
  8. Inside job: `runBuild` → `collectArtifacts`
  9. `sendSuccessNotification` or `sendFailureNotification`
  10. `createBuildRun` → `updateRepo` (status, timestamps, hash)
- `src/scheduler/poller.ts` — `startPoller(repo: Repo): void` — `setInterval` at `repo.pollingIntervalMs ?? config.DEFAULT_POLLING_INTERVAL_MS`; calls `triggerBuild(repo.id)` via the debouncer
- `src/scheduler/index.ts` — `startAllPollers(db: Db): Promise<void>` — queries all repos with `detectionMethod = 'polling'` and `syncPaused = false`; calls `startPoller` for each
- `instrumentation.ts` — extend the `nodejs` guard block: call `startAllPollers(db)` after migration
- `app/api/webhooks/[repoId]/route.ts` — replace the build-trigger stub with the real `triggerBuild` call via the debouncer
- `app/api/repos/[id]/build/route.ts` — new `POST` handler; calls `triggerBuild(id)` directly (no debounce for manual trigger per §6.3); returns 202
- `app/(dashboard)/repos/page.tsx` — re-enable the "Build" button; point it at `POST /api/repos/[id]/build`

**Tests to write (`src/scheduler/pipeline.test.ts`):** Mock all external dependencies (git helpers, builder, Discord client, DB queries).
- Happy path (upstream): new commit detected → `runBuild` called with correct task → `sendSuccessNotification` called → `createBuildRun` with `status: 'success'` → `updateRepo` with updated hash and `lastBuildStatus: 'success'`
- Happy path (fork, SSH): `sshPrivateKeyPath` set → `ensureCloned` and `fetchLatest` called with the key path
- Idempotency: `getHeadHash` returns the same hash as `repo.lastCommitHash` → `runBuild` never called, no Discord message sent
- Build failure: `runBuild` returns `{ success: false }` → `sendFailureNotification` called → `createBuildRun` with `status: 'failed'`
- Discord notification throws: `createBuildRun` is still called (build result persisted regardless of notification failure)

**Done:** All five pipeline tests pass. `pnpm test` passes for all test files. Repos with a build history show a real `lastBuildStatus` value in the list. `pnpm typecheck` and `pnpm lint` both exit 0.

---

## Acceptance

The phase is complete when **all** of the following are true:

1. `pnpm test` passes with zero failures across all test files.
2. `pnpm typecheck` exits 0. `pnpm lint` exits 0.
3. A repo with `detectionMethod: 'polling'` and a reachable public `gitUrl` automatically polls on startup. After a new commit is pushed upstream, the next polling interval triggers a Gradle build and a Discord message in the configured channel — with no manual action.
4. A fork-mode repo with `sshPrivateKeyPath` set clones and fetches via SSH. A `POST /api/webhooks/:repoId` with a valid signature triggers a pull and build of the fork.
5. Multiple polling events or webhook calls within the debounce window produce exactly one build, not N. The timer resets on each new event (not one-shot).
6. `POST /api/webhooks/:repoId` with an invalid or missing `X-Hub-Signature-256` returns 401 with no build triggered. Exceeding 60 requests/min from the same IP returns 429.
7. Build results are written to `build_runs`. `repos.lastBuildStatus` is `'success'` or `'failed'` after each run.
8. Discord success notifications include JAR attachments (or a text-link fallback for files over 25 MB). `-sources.jar` and `-dev.jar` files are never attached.
9. On build failure, Discord receives a failure notification containing the last ~50 lines of Gradle output.
10. At most `BUILD_CONCURRENCY` Gradle processes run simultaneously.
11. SSH private keys are stored with mode `0600` on disk. Private key content is never logged, returned in an API response, or rendered in the browser.
12. `docker build --build-arg JAVA_VERSION=21 .` and `docker build --build-arg JAVA_VERSION=25 .` both succeed.
13. All code lives on branch `phase-2-pipeline`. `main` is not touched. `plans/phase-2.md` is committed to the branch.

---

## Deferred to Phase 3

- Upstream rebase and conflict handling (§4.2.1)
- Discord conflict notification (§6.5)
- "Re-enable sync" button wiring (§7 sub-section 6.3)
- Build log viewer page (§7 sub-section 6.3 — "link to last build log")
