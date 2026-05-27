# Phase 1 — Project Scaffold & Repository Management

**Scope:** 2–3 sessions  
**Branch:** `phase-1-setup`  
**Goal:** Establish a runnable Next.js project with a persistent PostgreSQL database, authenticated web UI (Google OAuth + Resend magic-link), and full CRUD for tracked repositories. No build runner, Discord integration, scheduler, or Git operations in this phase — those are Phase 2+.

---

## Tasks

---

### Task 1 — Project Scaffold

**Goal:** Initialise the Next.js 14+ App Router project with TypeScript strict mode. Wire up Vitest, ESLint, and the `@/` path alias. Create the empty directory skeleton from CLAUDE.md §Project structure. Install all dependencies listed in REQUIREMENTS §2.

**Source:** §2 (full tech stack), CLAUDE.md §Project structure, §Code style

**Files to create:**
- `package.json` — scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`; runtime deps: `next`, `react`, `react-dom`, `typescript`, `drizzle-orm`, `pg`, `next-auth@beta`, `@auth/drizzle-adapter`, `discord.js`, `simple-git`, `zod`, `resend`; dev deps: `vitest`, `@vitest/coverage-v8`, `drizzle-kit`, `eslint`, `@types/pg`, `@types/react`, `@types/node`
- `tsconfig.json` — `strict: true`; `@/` alias pointing to the project root
- `next.config.ts`
- `vitest.config.ts` — Node environment, resolves `@/` alias
- `.eslintrc.json` — TypeScript + Next.js recommended rules; no-`any` rule enabled
- `.env.example` — all variables listed in the Task 2 env schema, each with a placeholder value and a one-line comment
- `.gitignore`
- Barrel index files (may be empty) in: `src/builder/`, `src/discord/`, `src/git/`, `src/scheduler/`, `src/db/`, `src/config/`

**Tests to write:**
- `src/config/config.test.ts` — a single smoke test that imports a no-op export from `src/config/` and asserts it is defined. Purpose: verify the Vitest runner, TypeScript compilation, and `@/` path alias all work end-to-end.

**Done criteria:**
- `pnpm install` completes without peer-dependency errors.
- `pnpm dev` starts the Next.js dev server with no TypeScript errors.
- `pnpm test` runs and the smoke test passes (exit 0).
- `pnpm lint` exits 0 on the empty scaffold.
- `pnpm typecheck` (`tsc --noEmit`) exits 0.

---

### Task 2 — Environment Config Module

**Goal:** Create a Zod schema that parses and validates all environment variables at process start. Export a single typed `config` object used everywhere in the codebase. A missing required variable must throw a descriptive Zod error at startup; optional variables must provide typed defaults.

**Source:** §2 (Zod), §10 (concurrency cap default 2, debounce default 60 000 ms), CLAUDE.md §Security defaults

**Required env variables (all must be present at startup):**
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — Auth.js session signing secret
- `GOOGLE_CLIENT_ID` — Google OAuth app client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth app client secret
- `RESEND_API_KEY` — Resend API key (for magic-link emails)
- `AUTH_EMAIL_FROM` — sender address used in magic-link emails (e.g. `noreply@yourdomain.com`)
- `DISCORD_BOT_TOKEN` — Discord bot token (§6 sub-section 5.1)

**Optional env variables (typed defaults):**
- `BUILD_CONCURRENCY` — integer, default `2` (§10)
- `DEBOUNCE_MS` — integer (ms), default `60000` (§10)
- `SSH_KEYS_DIR` — string, default `./data/keys` (§8)
- `DEFAULT_DISCORD_CHANNEL_ID` — string, default `""` (§7 sub-section 6.4)
- `DEFAULT_POLLING_INTERVAL_MS` — integer (ms), default `900000` (15 min, §4.1)

**Files to create / modify:**
- `src/config/env.ts` — Zod schema + `parseConfig()` + exported `config` singleton
- `.env.example` — one entry per variable above, placeholder value + one-line comment
- `src/config/env.test.ts`

**Tests to write:**
- A fully valid env object passes validation; all fields resolve to the correct TypeScript types.
- Omitting `DATABASE_URL` throws a `ZodError` naming the missing field.
- Omitting `AUTH_SECRET` throws.
- Omitting `GOOGLE_CLIENT_ID` throws.
- Omitting `RESEND_API_KEY` throws.
- Omitting `DISCORD_BOT_TOKEN` throws.
- `BUILD_CONCURRENCY` absent → value defaults to `2` (number, not string).
- `DEBOUNCE_MS` absent → value defaults to `60000`.
- A non-numeric value for `BUILD_CONCURRENCY` throws.

**Done criteria:**
- All nine tests pass.
- The exported `config` has no `any` fields; TypeScript infers types from the Zod schema.
- Importing the module in an environment missing a required var throws before any other code runs.

---

### Task 3 — Database Schema & Drizzle Client

**Goal:** Define the Drizzle schema for `repos` and `build_runs`. Set up the typed PostgreSQL client. Generate and apply the initial migration. All subsequent tasks use this schema — getting it right now prevents costly later migrations.

**Source:** §3 (track arbitrary repos), §4 (mode, branch, detection method, upstream URL, sync-paused flag), §5 (build artifacts, build failure), §7 sub-sections 6.2–6.3 (all fields the UI manages), §8 (SSH key paths), §9 (webhook secret), §10 (build history, last commit hash)

**Files to create:**
- `src/db/schema.ts` — Drizzle table definitions (columns listed below)
- `src/db/client.ts` — Drizzle client initialised from `config.databaseUrl` using the `pg` driver
- `src/db/migrations/` — initial migration file produced by `drizzle-kit generate`
- `drizzle.config.ts` — drizzle-kit configuration pointing at `src/db/schema.ts` and `src/db/migrations/`

**`repos` table columns (minimum):**  
`id` (uuid PK, default `gen_random_uuid()`), `name` (text), `git_url` (text), `mode` (text enum: `upstream` | `fork`), `branch` (text), `detection_method` (text enum: `polling` | `webhook`), `polling_interval_ms` (integer, nullable), `discord_channel_id` (text), `custom_build_task` (text, nullable), `ssh_private_key_path` (text, nullable), `ssh_public_key` (text, nullable), `webhook_secret` (text, nullable), `upstream_url` (text, nullable — fork mode only), `sync_paused` (boolean, default `false`), `last_commit_hash` (text, nullable), `last_build_status` (text enum: `success` | `failed` | `paused` | `pending`, nullable), `last_build_at` (timestamp, nullable), `created_at` (timestamp, default now()), `updated_at` (timestamp, default now())

**`build_runs` table columns (minimum):**  
`id` (uuid PK), `repo_id` (uuid FK → `repos.id`, on delete cascade), `status` (text enum: `success` | `failed`), `triggered_by` (text enum: `poll` | `webhook` | `manual` | `rebase`), `commits_json` (text — JSON array), `artifact_paths_json` (text, nullable — JSON array), `log_tail` (text, nullable), `started_at` (timestamp), `finished_at` (timestamp, nullable)

**Tests to write:**
- None at this task. The migration applying without error and Task 4's query tests are sufficient proof of schema correctness.

**Done criteria:**
- `pnpm drizzle-kit generate` produces a migration file with no errors.
- Migration applies to a fresh PostgreSQL instance without errors.
- `src/db/client.ts` exports a typed Drizzle instance and compiles under strict TypeScript.
- `pnpm typecheck` still exits 0.

---

### Task 4 — Repository CRUD Queries

**Goal:** Write the typed query helper functions that are the single point of contact with the `repos` table. All API routes in Task 6 call these functions; nothing else touches the table directly.

**Source:** §7 sub-section 6.2 (list, add, edit, remove), §7 sub-section 6.3 (last build status, sync controls)

**Files to create:**
- `src/db/queries/repos.ts` — exports: `listRepos`, `getRepo`, `createRepo`, `updateRepo`, `deleteRepo`
- `src/db/queries/repos.test.ts`

**Tests to write:**  
Use a dedicated test PostgreSQL database (separate `DATABASE_URL` in the test environment, e.g. a `_test` suffixed database created once and truncated between test runs via a Vitest `beforeEach`).
- `createRepo` inserts a row and returns the full record including generated `id` and `created_at`.
- `getRepo(id)` returns the correct row; `getRepo(unknownId)` returns `null`.
- `listRepos()` returns all rows in insertion order; returns `[]` when the table is empty.
- `updateRepo(id, patch)` changes only supplied fields; unspecified fields retain their original values.
- `deleteRepo(id)` removes the row; a subsequent `getRepo(id)` returns `null`.

**Done criteria:**
- All five tests pass against a real PostgreSQL instance.
- All functions are typed with return types inferred from the Drizzle schema — no `any`.
- `pnpm typecheck` exits 0.

---

### Task 5 — Auth.js Setup & Route Protection

**Goal:** Configure Auth.js v5 with two providers: Google OAuth and Resend (email magic-link). Use the Drizzle adapter so sessions and accounts are persisted to PostgreSQL. Add Next.js middleware that enforces a valid session on all dashboard pages and management API routes. Add a login page with both sign-in options.

**Source:** §7 sub-section 6.1 (access protection), §2 (Auth.js), CLAUDE.md §Security defaults

**Pre-requisites (outside the codebase):**
- A Google OAuth 2.0 client ID + secret (created in Google Cloud Console; authorised redirect URI: `http://localhost:3000/api/auth/callback/google` for dev).
- A Resend account with a verified sender domain; `AUTH_EMAIL_FROM` must be on that domain.

**Files to create / modify:**
- `src/auth.ts` — `NextAuth` config: Google provider, Resend email provider, Drizzle adapter, session strategy `jwt`
- `src/db/schema.ts` — add Auth.js adapter tables: `users`, `accounts`, `sessions`, `verification_tokens` (as specified by `@auth/drizzle-adapter` docs); extend the initial migration or generate a new one
- `app/api/auth/[...nextauth]/route.ts` — Auth.js catch-all handler
- `middleware.ts` — protects all routes under `/` and `/api/repos`, `/api/settings`; passes through `/api/auth/**` and `/api/webhooks/**` without a session check
- `app/login/page.tsx` — login page with a "Sign in with Google" button and an email input for the magic-link flow; minimal styling

**Tests to write:**
- No unit tests. Auth.js wiring is an integration concern. Done criteria are verified manually.

**Done criteria:**
- `GET /` (no session) → HTTP 302 redirect to `/login`.
- `GET /api/repos` (no session) → HTTP 401.
- Clicking "Sign in with Google" on `/login` initiates the Google OAuth flow and lands back on `/` after a successful sign-in.
- Entering a valid email on `/login` triggers a magic-link email via Resend; clicking the link in the email creates a session and redirects to `/`.
- `/api/webhooks/*` routes are reachable without a session (§9).
- Auth.js adapter tables (`users`, `accounts`, etc.) exist in the database after first sign-in.

---

### Task 6 — Repo Management API Routes

**Goal:** Implement the full REST API for repository management. Validate all incoming payloads with Zod before touching the database. Strip sensitive fields (`ssh_private_key_path`, `webhook_secret`) from all responses.

**Source:** §7 sub-section 6.2 (add, edit, remove, list), §7 sub-section 6.3 (manual trigger endpoint stub), §9 (webhook secret field), §8 (SSH fields)

**Files to create:**
- `app/api/repos/route.ts` — `GET` (list all), `POST` (create)
- `app/api/repos/[id]/route.ts` — `GET` (single), `PATCH` (update), `DELETE`
- `src/config/repo-schema.ts` — Zod `CreateRepoSchema` and `UpdateRepoSchema`

**Tests to write** (unit-test each handler; mock the DB query layer via `vi.mock`):
- `POST /api/repos` with a valid body → 201 + created repo; `ssh_private_key_path` and `webhook_secret` absent from response.
- `POST /api/repos` with a missing required field → 400 + Zod error detail.
- `GET /api/repos/[id]` with a valid id → 200 + repo; sensitive fields absent.
- `GET /api/repos/[id]` with an unknown id → 404.
- `PATCH /api/repos/[id]` with an unknown id → 404.
- `DELETE /api/repos/[id]` → 204 with empty body.
- Any write route with no session → 401.

**Done criteria:**
- All seven tests pass.
- No handler reads from the request body without first passing it through a Zod schema.
- `ssh_private_key_path` and `webhook_secret` never appear in any response body.
- `pnpm typecheck` exits 0.

---

### Task 7 — Web UI Dashboard Shell

**Goal:** Build the protected frontend: repo list page, add-repo form, edit-repo form. All data fetches go through the Task 6 API routes — no direct DB calls from React components. Render a disabled "Trigger manual build" button as a placeholder.

**Source:** §7 sub-section 6.2 (all form fields), §7 sub-section 6.3 (status column, manual trigger, re-enable sync button — stub), §7 sub-section 6.4 (global settings page — read-only stub)

**Files to create:**
- `app/(dashboard)/layout.tsx` — shared nav bar, session check wrapper
- `app/(dashboard)/page.tsx` — repo list table (columns: name, mode, branch, last build status, last build time, actions)
- `app/(dashboard)/repos/new/page.tsx` — "Add repo" form
- `app/(dashboard)/repos/[id]/edit/page.tsx` — "Edit repo" form, pre-filled from API
- `app/(dashboard)/settings/page.tsx` — read-only display of global settings (Discord bot token masked, default channel, default polling interval)

**Form fields required (§7 sub-section 6.2):** Git URL, mode (Public Upstream / Personal Fork), tracked branch, change detection method (Polling / Webhook), polling interval, Discord channel ID, custom build task (optional), SSH public key display (read-only placeholder — key generation is Phase 2).

**Tests to write:**
- None this task. Done criteria verified by manual smoke-testing.

**Done criteria:**
- Authenticated user can: navigate to `/`, see the empty repo table, click "Add repo", fill the form, submit, and see the new row appear in the table.
- Authenticated user can click "Edit" on a row, modify a field, save, and see the change reflected.
- Authenticated user can click "Delete" on a row, confirm, and see the row removed.
- "Trigger manual build" is rendered but disabled or shows a "not yet implemented" message — no endpoint is called.
- The SSH public key field shows placeholder text (e.g. "Key generation available in next phase").
- `webhook_secret` and `ssh_private_key_path` are never rendered in the browser.
- Unauthenticated access to `/` redirects to `/login`.

---

### Task 8 — Docker & Deployment Config

**Goal:** Produce a Dockerfile and `docker-compose.yml` that build and run the Next.js app alongside its PostgreSQL companion. Migrations must run automatically on container startup before the app accepts traffic.

**Source:** §2 (Docker, Dokploy, PostgreSQL companion container), §10 (self-hosted VPS)

**Files to create:**
- `Dockerfile` — multi-stage: `deps` (pnpm install), `builder` (next build), `runner` (production image, non-root user)
- `docker-compose.yml` — `app` service + `db` service (`postgres:16`); named volume for PG data; bind mounts for `./data/keys` (SSH keys) and `./data/logs` (build logs); `app` depends on `db` with a healthcheck
- `.dockerignore`
- `scripts/migrate.ts` — runs `drizzle-kit migrate` using the runtime `DATABASE_URL`; invoked as the first step of the container entrypoint before `next start`

**Tests to write:**
- None. Verified by running `docker compose up --build`.

**Done criteria:**
- `docker compose up --build` builds both images and starts both services without errors.
- App is reachable at `http://localhost:3000`; the login page is shown to an unauthenticated browser.
- `./data/keys/` and `./data/logs/` survive a `docker compose restart`.
- Migrations run on every container start; re-running them on an already-migrated DB does not error.
- No secret values appear in image layers (`docker history app` shows no token or key values).

---

## Acceptance Criteria

The phase is complete when **all** of the following are true:

1. `pnpm test` passes with zero failures (Tasks 1, 2, 4, 6).
2. `pnpm lint` exits 0.
3. `pnpm typecheck` (`tsc --noEmit`) exits 0.
4. An authenticated user can sign in via Google OAuth or Resend magic-link on the `/login` page (Task 5).
5. Unauthenticated requests to dashboard pages redirect to `/login`; unauthenticated `GET /api/repos` returns HTTP 401 (Task 5).
6. A repo can be created, read, updated, and deleted through both the API (Task 6) and the web UI (Task 7), verified end-to-end against a real PostgreSQL database.
7. `docker compose up --build` starts the full stack; the app is reachable and functional at `localhost:3000` (Task 8).
8. No SSH private key values, Discord bot tokens, webhook secrets, Google client secrets, or Resend API keys appear in any HTTP response body, browser-rendered page, or application log.
9. All code lives on branch `phase-1-setup`; `main` has not been touched.
10. `plans/phase-1.md` is committed to the branch.

---

## Deferred to Later Phases

The following are explicitly out of scope for Phase 1:

- SSH key-pair generation (§8) — the UI field is a placeholder.
- Webhook endpoint implementation and signature validation (§9).
- Polling scheduler and debounce logic (§10).
- Gradle build runner, Stonecutter detection, artifact collection (§5).
- Discord bot client and notification formatting (§6).
- Rebase logic and conflict handling (§4.2.1).
- Build concurrency queue (§10).
- Manual build trigger action (§7 sub-section 6.3) — button rendered but not wired.
