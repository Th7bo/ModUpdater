# Phase 4 — UI Polish, Build History, and Key Generation

**Scope:** 2-3 sessions  
**Branch:** `phase-4-polish`  
**Goal:** Close the remaining REQUIREMENTS.md gaps: display webhook URLs for copy, add build history list, improve repo list with time/hash columns, implement SSH key generation, and polish the dashboard UX.

---

## Decisions

1. **SSH key generation**: Implement per REQUIREMENTS §8. Platform generates key pairs on demand. Public key displayed for user to add to GitHub as deploy key. Private key stored with 600 permissions.
2. **Global settings**: Keep as environment variables (not editable in UI). REQUIREMENTS §7.4 lists them but doesn't mandate UI editing. The current read-only display is acceptable for v1.
3. **Build history retention**: Display all stored build runs (schema already supports this). Log file pruning (5 per repo) already handles disk space.

---

## Tasks

---

### Task 1 — Webhook URL Display and Copy (§7.3, §9)

**Goal:** Show the webhook URL on the repo edit page for repos using webhook detection. Include a copy-to-clipboard button.

**Source:** REQUIREMENTS §7.3 (Webhook URL to copy), §9 (webhook endpoint format `POST /webhook/:repoId`)

**Files to create/modify:**
- `app/(dashboard)/repos/[id]/edit/page.tsx` — add webhook URL display section below the form when `detectionMethod === 'webhook'`
- `app/(dashboard)/_components/copy-button.tsx` — new client component for copy-to-clipboard functionality

**Tests:** None required (UI feature, verified manually).

**Done criteria:**
- Webhook URL is displayed on the edit page for webhook-mode repos only
- Copy button copies the full URL to clipboard
- URL format matches `/api/webhooks/<repoId>`

---

### Task 2 — Repo List Improvements (§7.2)

**Goal:** Add "Last Build" (time) and "Last Commit" (hash, truncated) columns to the repo list table.

**Source:** REQUIREMENTS §7.2 (list showing last build time, last commit hash)

**Files to modify:**
- `app/(dashboard)/repos/page.tsx` — add columns for `lastBuildAt` (formatted) and `lastCommitHash` (truncated to 7 chars)

**Tests:** None required (UI change, verified manually).

**Done criteria:**
- Last Build column shows formatted timestamp or "Never"
- Last Commit column shows truncated hash or "—"
- Table remains responsive and readable

---

### Task 3 — Build History Page (§7.3, §10)

**Goal:** Create a per-repo build history page showing all past builds with status, trigger source, timestamps, and links to logs.

**Source:** REQUIREMENTS §10 (build history stored in database), §7.3 (link to last build log implies history access)

**Files to create/modify:**
- `app/(dashboard)/repos/[id]/builds/page.tsx` — new page listing all builds for a repo
- `src/db/queries/build-runs.ts` — already has `listBuildRuns` (verify limit parameter works correctly)
- `app/(dashboard)/repos/page.tsx` — change "Logs" button to "History" linking to builds page
- `app/api/repos/[id]/logs/[buildId]/route.ts` — new route for viewing specific build logs (not just latest)

**Tests:**
- `src/db/queries/build-runs.test.ts` — verify `listBuildRuns` returns builds in descending order with working limit

**Done criteria:**
- Build history page shows all builds for a repo
- Each build shows: status, triggered by, started at, finished at, log link
- Users can view logs for any build, not just the latest
- Build history page is accessible from the repo list

---

### Task 4 — SSH Key Pair Generation (§8)

**Goal:** Platform generates SSH key pairs per fork repo. User sees the public key to add as a GitHub Deploy Key. Private key stored securely with 600 permissions.

**Source:** REQUIREMENTS §8 (platform generates key pair, public key displayed in UI, private key stored with 600 permissions)

**Files to create/modify:**
- `src/git/ssh-keys.ts` — add `generateSshKeyPair(repoId, keysDir): Promise<{ publicKey: string; privateKeyPath: string }>` using Node.js crypto or `ssh-keygen` via child_process
- `src/db/schema.ts` — `sshPublicKey` column already exists (from Phase 1)
- `app/(dashboard)/actions.ts` — `createRepoAction` or `updateRepoAction`: if mode is 'fork' and no SSH key exists, generate one
- `app/(dashboard)/_components/repo-form.tsx` — display public key in a read-only field with copy button when editing a fork repo

**Tests:**
- `src/git/ssh-keys.test.ts` — extend existing tests:
  - `generateSshKeyPair` creates valid key pair
  - Private key file has mode 0o600
  - Public key is returned in authorized_keys format
  - Calling twice for same repo overwrites existing keys

**Done criteria:**
- Fork repos get SSH keys generated automatically (or on demand)
- Public key displayed in UI for copy to GitHub
- Private key stored at `${SSH_KEYS_DIR}/repo-<id>.pem` with 600 permissions
- Existing manual key paste flow still works (for users who prefer their own keys)

---

### Task 5 — Dashboard Polish and Error States

**Goal:** Improve error handling, loading states, and visual feedback across the dashboard.

**Files to modify:**
- `app/(dashboard)/repos/page.tsx` — add loading skeleton for SSR
- `app/(dashboard)/_components/build-button.tsx` — improve feedback after trigger
- `app/(dashboard)/repos/[id]/logs/page.tsx` — handle log file missing more gracefully
- `app/(dashboard)/repos/[id]/builds/page.tsx` — add empty state for repos with no builds
- `app/(dashboard)/settings/page.tsx` — add LOG_DIR and REPOS_DIR to the displayed settings

**Tests:** None required (UI polish).

**Done criteria:**
- No raw errors shown to users
- Loading states are clear
- Empty states have helpful messages
- Settings page shows all relevant configuration

---

## Acceptance

The phase is complete when all of the following are true:

1. `pnpm test` passes with zero failures.
2. `pnpm typecheck` exits 0. `pnpm lint` exits 0.
3. Webhook-based repos show a copyable webhook URL on their edit page.
4. The repo list table includes "Last Build" and "Last Commit" columns.
5. Each repo has a build history page listing all past builds with links to individual logs.
6. Fork repos can have SSH key pairs generated by the platform; public key is displayed for copy.
7. Private keys are stored with mode 0600.
8. Dashboard shows appropriate loading and empty states.
9. All code lives on branch `phase-4-polish`. `main` is not touched. `plans/phase-4.md` is committed to the branch.

---

## Deferred / Out of Scope

- Global settings editing in UI (kept as env vars per Decision 2)
- Per-repo Java version management (REQUIREMENTS §5.1 mentions this but complexity is high)
- Multi-user roles (REQUIREMENTS §11)
- Auto-conflict resolution (REQUIREMENTS §11)
- Publishing to Modrinth/CurseForge (REQUIREMENTS §11)
