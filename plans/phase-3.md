# Phase 3 - Fork Upstream Sync, Recovery, and Log Access

**Scope:** 2-3 sessions  
**Branch:** `phase-3-sync-logs`  
**Goal:** Complete the deferred fork-sync path and operator visibility work: upstream change detection for fork repos, safe conflict handling, Discord conflict notifications, manual sync re-enable controls, and authenticated build/sync log access. This phase does not add new mod loaders, multi-user roles, publishing integrations, or containerized per-build isolation.

---

## Decisions

1. **Fork upstream branch source:** Use the repo's existing tracked `branch` for both the fork remote and upstream remote. No separate `upstream_branch` field in this phase. This implements REQUIREMENTS §4.2.1 using one configured branch value.
2. **Pause semantics:** `sync_paused` is a general repo pause. When a conflict happens, the platform stops upstream sync, fork push webhook builds, polling builds, and manual builds until the fork creator resolves the issue and re-enables the repo. This clarifies REQUIREMENTS §4.2.1 and §7 sub-section 6.3.
3. **Upstream sync strategy:** Use the user's normal workflow: fetch upstream, merge `upstream/<branch>` into the fork branch, then push `origin <branch>`. This intentionally differs from the word "rebase" in REQUIREMENTS §4.2.1. Before implementation starts, REQUIREMENTS.md should be updated to say "merge upstream changes" instead of "rebase" so the phase plan and source of truth agree.
4. **Log retention:** Retain the 5 most recent build/sync logs per repo. Older logs for that repo are deleted after a new log is finalized. This fills the retention gap in REQUIREMENTS §10.

---

## Open Questions Before Implementation

None, assuming REQUIREMENTS.md is updated to reflect Decision 3 before implementation starts.

---

## Tasks

---

### Task 1 - Activity Log Storage, Retention, and Build-Run Log Links

**Goal:** Add a durable, timestamped log storage path for build and sync activity, retain the latest 5 logs per repo, and persist enough metadata for the dashboard to link each repo to its latest log. This establishes the storage surface used by later sync and viewer tasks.

**Source:** REQUIREMENTS §10 (logging to disk with timestamps, accessible via web UI), §5 sub-section 4.5 (build failure log excerpt), §7 sub-section 6.3 (link to last build log).

**Files to create or modify:**
- `src/config/env.ts` - add a validated log directory setting with a default under `./data/logs`.
- `.env.example` - document the log directory setting.
- `docker-compose.yml` - ensure the log directory is persisted as a mounted volume.
- `src/logging/activity-log.ts` - create a small server-side helper for creating per-run log files, appending timestamped lines, pruning logs beyond the 5-per-repo retention limit, and returning safe metadata.
- `src/db/schema.ts` - add nullable log path metadata to build-run history if it is not already present.
- `src/db/queries/build-runs.ts` - expose log path metadata through typed query helpers.
- Drizzle migration file for the schema change.

**Tests to write:**
- `src/config/env.test.ts` - log directory defaults correctly and accepts an override.
- `src/logging/activity-log.test.ts` - creates parent directories, appends timestamped entries, returns paths under the configured log directory, prunes logs beyond 5 per repo, and rejects path traversal attempts.
- `src/db/queries/build-runs.test.ts` - build-run records can store and retrieve log path metadata.

**Done criteria:**
- Log files are always created under the configured log directory.
- Only the 5 most recent logs per repo are retained after a new log is finalized.
- Build-run query helpers can store and return log metadata without exposing arbitrary filesystem paths to the UI.
- The migration applies cleanly to an existing development database.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

### Task 2 - Full Build Log Capture and Authenticated Log Viewer

**Goal:** Capture complete build logs to disk while preserving the existing last-50-lines failure summary, then add an authenticated dashboard page and API route for viewing the latest build log for a repo.

**Source:** REQUIREMENTS §5 sub-section 4.5 (failure log tail), §7 sub-section 6.3 (link to last build log), §10 (activity logs accessible via web UI), §7 sub-section 6.1 (authenticated web UI).

**Files to create or modify:**
- `src/builder/runner.ts` - extend build execution to stream full output into the activity log while still returning a failure tail.
- `src/scheduler/pipeline.ts` - pass log handles through the build lifecycle and persist the resulting log metadata in build history.
- `app/api/repos/[id]/logs/latest/route.ts` - authenticated route returning the latest log content for the repo.
- `app/(dashboard)/repos/[id]/logs/page.tsx` - authenticated page that displays the latest log with repo/build metadata.
- `app/(dashboard)/page.tsx` or the current repo list component - link each repo's last build log when one exists.

**Tests to write:**
- `src/builder/runner.test.ts` - full output is written to the provided log target; returned `logTail` remains limited to the last roughly 50 lines.
- `src/scheduler/pipeline.test.ts` - successful and failed builds both persist log metadata.
- Route handler tests for `app/api/repos/[id]/logs/latest/route.ts` - unauthenticated requests are rejected, missing logs return 404, and logs outside the configured log directory are not readable.

**Done criteria:**
- Every build attempt produces a complete disk log with timestamps.
- Build failures still send only the configured tail to Discord.
- Authenticated users can open the latest build log from the dashboard.
- The log API cannot read files outside the configured log directory.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

### Task 3 - Fork Upstream Merge Git Helpers

**Goal:** Implement the low-level `simple-git` helpers needed to compare a fork branch with its upstream remote, fetch upstream, merge `upstream/<branch>` into the fork branch, abort and restore on conflict, report conflicting files, and push a successful merge back to the fork remote.

**Source:** REQUIREMENTS §4.2.1 (upstream commits, sync conflict abort/restore, push after success), §8 (private key used for fork clone/pull/push), §2 (Git operations use `simple-git`). Decision 3 requires REQUIREMENTS §4.2.1 to be updated from rebase wording to merge wording before implementation.

**Files to create or modify:**
- `src/git/upstream-sync.ts` - helpers for ensuring an upstream remote exists, fetching upstream, finding upstream commits missing from the fork, snapshotting the pre-merge state, attempting `merge upstream/<branch>`, aborting/restoring on conflict, listing conflicted files, and pushing a successful merge to `origin <branch>`.
- `src/git/repo-sync.ts` - reuse existing SSH authentication behavior for upstream fetch and fork push paths if needed.
- `src/git/types.ts` or the existing shared git type file - define typed upstream sync result and conflict metadata shapes if no suitable local type already exists.

**Tests to write:**
- `src/git/upstream-sync.test.ts` with `simple-git` mocked:
  - No upstream-only commits returns a no-op result.
  - Upstream-only commits are detected in oldest-first order.
  - Successful merge calls `push origin <branch>`.
  - Merge conflict aborts the merge and restores the pre-merge state before returning.
  - Conflict result includes conflicting files and commit range metadata.
  - SSH key path is passed through to all fork git operations that need it.

**Done criteria:**
- Upstream sync helpers never leave a conflict path without first aborting the merge and restoring the pre-merge state.
- Git operations use `simple-git`; no raw git shell commands are introduced.
- Conflict metadata includes enough information for Discord and the dashboard.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

### Task 4 - Upstream Merge Pipeline Integration and General Pause State

**Goal:** Wire the upstream merge helpers into the scheduler so fork repos can periodically detect upstream changes, merge successfully, push the fork branch, and trigger a build. On conflict, update the repo to generally paused, log the sync attempt, and stop all build/sync triggers until re-enabled.

**Source:** REQUIREMENTS §4.2.1 (periodic upstream checks, upstream sync, push, build, pause on conflict), §5 (build after successful sync), §7 sub-section 6.3 (paused status), §10 (concurrency, idempotency, logging). Decision 2 defines pause as a general repo pause.

**Files to create or modify:**
- `src/scheduler/upstream-sync.ts` - orchestrate upstream checks, merge attempts, pause handling, and handoff to the existing build trigger.
- `src/scheduler/index.ts` and `src/scheduler/poller.ts` - start fork upstream sync polling without duplicating normal build polling, and skip all trigger sources when `sync_paused` is true.
- `src/scheduler/pipeline.ts` - accept upstream-sync-triggered builds and preserve idempotency with `last_commit_hash`; reject manual/webhook/polling builds while the repo is paused.
- `src/db/queries/repos.ts` - add typed helpers for marking a repo paused, clearing pause state, and updating status metadata.
- `src/logging/activity-log.ts` - record sync-specific log entries.

**Tests to write:**
- `src/scheduler/upstream-sync.test.ts`:
  - No upstream commits does not trigger a build.
  - Successful merge pushes the fork branch and triggers one build.
  - Conflict marks the repo paused before returning.
  - Paused repos are skipped for future upstream sync attempts.
  - Rebase sync writes a sync log for success and conflict paths.
- Extend `src/scheduler/pipeline.test.ts` to verify paused repos reject webhook, polling, and manual build triggers.
- Extend build-trigger route tests to verify manual builds are rejected while paused.

**Done criteria:**
- Fork repos with upstream changes follow the path: fetch upstream, merge `upstream/<branch>`, push `origin <branch>`, debounce/build, notify.
- Conflict paths pause upstream sync, fork push webhook builds, polling builds, and manual builds until the repo is re-enabled.
- The scheduler does not create duplicate builds for the same post-rebase commit.
- Rebase sync activity is visible in persisted logs.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

### Task 5 - Discord Upstream Sync Conflict Notification

**Goal:** Send a Discord notification when an upstream merge conflict pauses a fork repo, including the fork name, upstream repo, conflicting commit range, conflicting files, and the re-enable instruction from the requirements.

**Source:** REQUIREMENTS §4.2.1 (notify on conflict), §6 sub-section 5.2 (per-repo Discord channel), §6 sub-section 5.5 (conflict notification format).

**Files to create or modify:**
- `src/discord/notifications.ts` - add a conflict notification formatter/sender.
- `src/scheduler/upstream-sync.ts` - call the conflict notification after abort/restore and pause state are complete.
- `src/discord/types.ts` or existing shared type file - add typed conflict notification input if needed.

**Tests to write:**
- `src/discord/notifications.test.ts`:
  - Conflict notification embed includes fork name, upstream repo, commit range, and conflicting files.
  - The message includes the instruction to re-enable syncing via the dashboard once resolved.
  - Large conflict file lists are truncated or summarized without exceeding Discord embed limits.
- `src/scheduler/upstream-sync.test.ts` - notification is sent only after abort/restore and pause persistence succeed.

**Done criteria:**
- Conflict Discord messages match the required content.
- Notification failures do not prevent the repo from being marked paused or the sync log from being written.
- No secrets, SSH key paths, webhook secrets, or token values appear in the notification.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

### Task 6 - Re-enable Repo API and Dashboard Control

**Goal:** Wire the dashboard "Re-enable sync" control so an authenticated user can clear the general paused state after the fork creator has manually resolved the merge conflict. The action must be explicit, auditable, and must not immediately run an unsafe upstream sync in the same request.

**Source:** REQUIREMENTS §4.2.1 (pause until manually re-enabled via web UI), §7 sub-section 6.3 ("Re-enable sync" button), §7 sub-section 6.1 (protected web UI).

**Files to create or modify:**
- `app/api/repos/[id]/reenable-sync/route.ts` - authenticated POST endpoint that clears pause state and records the action.
- `app/(dashboard)/page.tsx` or the current repo list component - show an enabled "Re-enable sync" control only for paused repos.
- `app/(dashboard)/repos/[id]/edit/page.tsx` or repo detail component if present - surface paused state and last conflict/log link.
- `src/db/queries/repos.ts` - reuse or add a typed unpause helper.
- `src/logging/activity-log.ts` - record manual re-enable events.

**Tests to write:**
- Route handler tests:
  - Unauthenticated requests return 401.
  - Unknown repo returns 404.
  - Non-paused repo returns 409 because there is no paused state to clear.
  - Paused repo clears `sync_paused` and writes an audit log entry.
- Component or action tests if the project already has a UI testing pattern for dashboard actions.

**Done criteria:**
- Paused repos visibly expose a re-enable control in the dashboard.
- Re-enable clears the pause flag and records an audit log entry.
- The endpoint does not trigger an upstream sync or build directly; the next scheduler cycle handles future sync.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for the touched areas.

---

## Acceptance

The phase is complete when all of the following are true:

1. REQUIREMENTS.md is updated before implementation starts so REQUIREMENTS §4.2.1 describes the decided upstream merge workflow instead of rebase wording.
2. `pnpm test` passes with zero failures across all test files.
3. `pnpm typecheck` exits 0 and `pnpm lint` exits 0.
4. Build and sync activity produce timestamped disk logs under the configured log directory, and authenticated dashboard users can view the latest repo log.
5. Build log access is authenticated and constrained to the configured log directory.
6. A fork repo with upstream-only commits can fetch upstream, merge `upstream/<branch>` into the fork branch, push `origin <branch>`, and trigger exactly one build for the merged head.
7. If an upstream merge conflict occurs, the merge is aborted, the fork checkout is restored to its pre-merge state, the repo is marked paused, and no build is triggered.
8. Conflict notifications are sent to the configured Discord channel with fork name, upstream repo, conflicting commit range, conflicting files, and the required re-enable instruction.
9. Paused repos do not perform upstream sync, fork push webhook builds, polling builds, or manual builds until manually re-enabled through the authenticated dashboard control.
10. Re-enabling sync clears the paused state, records an audit log entry, and does not immediately run an upstream sync or build in the same request.
11. No SSH private keys, Discord bot tokens, webhook secrets, or private key filesystem paths are exposed in logs, API responses, browser-rendered pages, or Discord notifications.
12. Only the 5 most recent logs per repo are retained.
13. All code for this phase lives on branch `phase-3-sync-logs`; `main` is not touched. `plans/phase-3.md` is committed to the branch.
