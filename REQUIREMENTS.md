# REQUIREMENTS.md — Mod CI/CD Platform

## 1. Project Overview

A self-hosted platform that tracks Minecraft Fabric mod repositories (both public upstream repos and personal forks), automatically detects new commits, builds the mods, and delivers the resulting `.jar` files along with commit summaries to a Discord channel.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js + TypeScript (strict mode) |
| Framework | Next.js (App Router) — API routes + React frontend |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Auth.js |
| UI styling | Tailwind CSS v4 (utility classes; `.btn` / `.status` component layers in `globals.css`) |
| Discord | `discord.js` |
| Git operations | `simple-git` (no raw CLI shell calls) |
| Containerisation | Docker, deployed via Dokploy; PostgreSQL as a companion container |
| Test runner | Vitest |

---

## 3. Scope & Goals

- Track an arbitrary number of mod repositories, each independently configured.
- Support two repository modes: **public upstream** and **personal fork**.
- Automatically trigger builds on new commits via polling or webhooks (configurable per repo).
- Build Fabric mods using Gradle, respecting multi-version setups (e.g. Stonecutter).
- Deliver build artifacts and commit logs to Discord (channel configurable per mod).
- Provide a simple web UI for managing tracked repositories.
- Run entirely on a self-hosted VPS/server.

---

## 4. Repository Modes

### 4.1 Public Upstream Repo

A mod repository that is not owned or forked by the user.

**Change detection (configurable per repo):**
- **Polling:** The platform checks for new commits on a configurable schedule (default: every 15 minutes).
- **GitHub Webhook:** The platform exposes a webhook endpoint; the user manually registers it on the upstream repo's GitHub settings.

**Trigger condition:** New commit(s) detected on the tracked branch since the last successful build.

**Action:** Clone/pull latest → build → deliver to Discord.

### 4.2 Personal Fork Repo

A fork of an upstream mod repository, hosted on GitHub, with personal modifications.

**Two sub-scenarios:**

#### 4.2.1 Upstream Has New Commits (Rebase)

- The platform periodically checks the upstream remote for new commits not present in the fork.
- If found, it performs a `git rebase` of the fork's branch onto the upstream changes.
- **Conflict handling:** If the rebase fails due to a merge conflict:
  - Abort the rebase, restore the fork to its pre-rebase state.
  - Send a Discord notification to the configured channel describing the conflict (conflicting files, commits involved).
  - Pause all further rebase attempts for this repo until manually re-enabled via the web UI.
- If rebase succeeds: push the rebased branch to the fork remote, then trigger a build.

#### 4.2.2 User Pushes to Fork

- The platform receives a GitHub webhook from the fork repo (user registers this once, the platform provides the endpoint URL).
- On push event: pull the latest changes → build → deliver to Discord.

---

## 5. Build System

### 4.1 Runtime Requirements

- Java (version managed per repo; default inferred from the repo's `gradle/wrapper/gradle-wrapper.properties`).
- Gradle Wrapper (`./gradlew`) — the platform uses the wrapper bundled in the repo, not a system Gradle.

### 4.2 Build Command

```
./gradlew build
```

### 4.3 Multi-Version Support (Stonecutter)

- The platform detects the presence of Stonecutter by checking for `stonecutter.gradle` or equivalent config in the repo root.
- **If Stonecutter is detected:** run the appropriate Stonecutter build task (e.g. `./gradlew chiseledBuild` or equivalent) to produce JARs for all configured MC versions.
- **If Stonecutter is absent:** run a standard `./gradlew build`.
- The specific build task to use is **overridable per repo** in the web UI.

### 4.4 Artifact Collection

- After a successful build, the platform scans `build/libs/` (and sub-project `build/libs/` directories for multi-version builds) for `.jar` files, excluding `-sources.jar` and `-dev.jar` variants.
- All collected JARs are treated as build artifacts.

### 4.5 Build Failure Handling

- On build failure: send a Discord notification with the tail of the build log (last ~50 lines) and the list of commits that triggered the build.
- Do **not** deliver any JARs.
- Mark the repo as "last build failed" in the web UI.

---

## 6. Discord Integration

### 5.1 Bot Setup

- A single Discord bot token is configured globally in the platform's config.
- The bot must have permission to send messages and upload files in all configured channels.

### 5.2 Per-Repo Channel Configuration

- Each tracked repo has a `discord_channel_id` setting.
- Different repos may send to the same or different channels.

### 5.3 Success Notification Format

On a successful build, the bot sends:

- **Embed:** Mod name, repo URL, branch, build timestamp.
- **Commit list:** All commits included in this update (hash, author, message, timestamp), formatted as a readable list in the embed or as a code block.
- **File attachments:** All collected `.jar` files (one or more, depending on Stonecutter targets).

> Note: Discord has a 25 MB file size limit per attachment. If a JAR exceeds this, the bot should notify in the message that the file was too large and link to the repo instead.

### 5.4 Failure Notification Format

- **Embed:** Mod name, repo, branch, error type (build failed / rebase conflict).
- **Build log excerpt:** Last ~50 lines of Gradle output as a code block (or attached as `.txt` if too long).
- **Commits that triggered the build** (if applicable).

### 5.5 Conflict Notification Format

- **Embed:** Fork name, upstream repo, conflicting commit range.
- List of conflicting files.
- Instructions prompt: "Re-enable syncing via the dashboard once resolved."

---

## 7. Web UI

### 6.1 Technology

- Next.js App Router (server components + server actions), self-hosted on the same VPS.
- Styled with Tailwind CSS v4; utility classes in JSX, `.btn` and `.status` component layers in `app/globals.css`.
- Access protected by Auth.js (Google OAuth + Resend magic-link).

### 6.2 Repository Management

- **Add a repo:** Input fields for:
  - Git URL
  - Mode: Public Upstream or Personal Fork
  - Tracked branch
  - Change detection method (Polling / Webhook) — for public upstream
  - Polling interval (if polling)
  - Discord channel ID
  - Custom build task (optional override)
  - SSH deploy key (for private fork repos, paste public key; platform generates the key pair)
- **Edit a repo:** Modify any of the above settings.
- **Remove a repo:** Stop tracking, remove local clone.
- **List all repos:** Table showing name, mode, last build status, last build time, last commit hash.

### 6.3 Repo Status & Controls

Per repo, the UI exposes:
- Last build status (success / failed / paused).
- Link to last build log.
- "Trigger manual build" button.
- "Re-enable sync" button (shown when paused due to rebase conflict).
- Webhook URL to copy (for webhook-based repos).

### 6.4 Global Settings

- Discord bot token.
- Default polling interval.
- Default Discord channel ID (fallback).

---

## 8. Authentication for Private Fork Repos

- The platform generates an SSH key pair per fork repo.
- The **public key** is displayed in the web UI for the user to add as a GitHub Deploy Key on the fork repo.
- The platform uses the **private key** when cloning/pulling/pushing the fork.
- Keys are stored securely on the VPS filesystem with appropriate file permissions (`600`).

---

## 9. Webhook Endpoint

- The platform exposes an HTTP endpoint (e.g. `POST /webhook/:repoId`) to receive GitHub push events.
- Validates the GitHub webhook signature (`X-Hub-Signature-256`) using a per-repo secret configured in both GitHub and the platform.
- On valid payload: enqueues a build job for the relevant repo.

---

## 10. Non-Functional Requirements

- **Concurrency:** Multiple repos may trigger builds simultaneously; the platform should queue and run builds concurrently up to a configurable limit (default: 2 parallel builds) to avoid overloading the VPS.
- **Persistence:** Repo configuration and build history are stored in a local database (e.g. SQLite).
- **Logging:** All build and sync activity logged to disk with timestamps, accessible via the web UI.
- **Idempotency:** Polling should not trigger a duplicate build if no new commits have arrived since the last build.
- **Build debounce:** When a change is detected (via polling or webhook), the platform waits a configurable delay (default: 1 minute) before starting the build. If additional commits arrive during that window, the timer resets. This prevents redundant consecutive builds when a maintainer merges multiple PRs in quick succession.

---

## 11. Out of Scope (v1)

- Support for Forge, NeoForge, Quilt, or other mod loaders.
- Multi-user access / role management.
- Automatic resolution of rebase conflicts.
- Publishing to Modrinth or CurseForge.
- Containerised build isolation (Docker per build) — may be considered in a future version.