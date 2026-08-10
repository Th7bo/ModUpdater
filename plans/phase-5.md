# Phase 5 — JAR Metadata and Client Manifest API

**Scope:** 2-3 sessions
**Branch:** `phase-5-manifest-api`
**Goal:** Make builds machine-consumable. Extract `fabric.mod.json` metadata and SHA-256 from every collected JAR, persist it per-artifact, and expose a token-authenticated manifest endpoint that a client-side updater can diff against an instance's `mods/` folder.

This phase is platform-side only. The `modupdater-cli` and `modupdater-mod` clients (REQUIREMENTS §12.6) live in separate repositories and are not built here.

---

## Status — complete (2026-08-10)

All 7 tasks implemented on `phase-5-manifest-api`. Suite: 20 files, 179 passed,
4 skipped, 0 failures. `pnpm typecheck` and `pnpm build` both clean.

Verified live against a running server with a seeded real JAR: 401 without/with a
bad token, 200 with a valid one, `?mc=` filtering both ways, and the manifest's
`downloadUrl` resolving to a real 237-byte artifact.

**Deviations from the plan as written:**

- Task 7 targeted a per-build detail page. None exists in the codebase, so the
  metadata display landed on `/repos/[id]/artifacts` instead.
- Acceptance criterion 2 is half-met: `pnpm lint` fails for an environmental
  reason predating this phase — a stray `eslint.config.mjs` in the parent
  directory of the repo that ESLint's flat-config lookup finds and can't resolve.
  Fails identically with the phase's changes stashed.
- Acceptance criterion 4 is verified through the backfill path and pipeline unit
  tests, not an actual Gradle build. The pipeline wiring has not run against a
  real build yet.
- Acceptance criterion 10 is **open**: backfill has been run against the test
  database only. Running it against production is a manual step.
- Out-of-scope fix carried here: `schema.ts` had `jdk_version` and `user.role`
  with no corresponding migration, so a fresh database was missing both and every
  repo-backed test failed. Fixed in its own commit (`0003_add_jdk_version.sql`).
- `pnpm add yauzl` also re-resolved `next-auth` from `5.0.0-beta.31` to `beta.32`,
  because `package.json` pins the `"beta"` tag rather than a version.

---

## Decisions

1. **`yauzl` is the ZIP reader** — approved 2026-08-10. Node has no built-in ZIP support (`zlib` handles raw deflate, not the container). `yauzl` streams, so reading one small entry out of a tens-of-megabytes JAR doesn't load the whole archive. Rejected: `adm-zip` (reads entire archive into memory), a hand-rolled central-directory parser (fiddly format, needs its own test suite), and shelling out to `unzip` (system dependency in the image).
2. **New `artifacts` table, `build_runs.artifact_paths_json` untouched.** §6 Discord delivery reads the existing column and must keep working. Duplication is deliberate and temporary; consolidating is a later cleanup, not this phase.
3. **Metadata extraction never fails a build** (§12.1). A JAR that can't be parsed is stored with null metadata and skipped by the manifest. Builds are the product; metadata is an enhancement.
4. **MC version normalization is server-side only** (§12.1). Clients do exact string matching. One fuzzy implementation, one test suite, in this repo.
5. **`CLIENT_API_TOKEN` is an env var**, consistent with Phase 4 Decision 2 (global settings stay in env, not UI-editable).
6. **Artifact downloads stay public** (§12.4). Gating them would break Discord embeds. Only the manifest is protected.
7. **Existing artifacts get backfilled** (Task 6). Without it the manifest stays empty until every repo happens to build again.

---

## Tasks

---

### Task 1 — JAR Metadata Reader (§12.1)

**Goal:** Read `fabric.mod.json` and compute SHA-256 for a JAR on disk.

**Dependency:** add `yauzl` + `@types/yauzl` (Decision 1).

**Files to create:**
- `src/builder/mod-metadata.ts` — `readModMetadata(jarPath): Promise<ModMetadata | null>` and `hashFile(path): Promise<string>`
- `src/builder/mod-metadata.test.ts`

**Shape:**
```ts
export interface ModMetadata {
  modId: string
  modVersion: string | null
  displayName: string | null
  mcVersionsRaw: string | null
  mcVersions: string[]
}
```

**Tests:**
- Valid JAR → correct `modId`, `modVersion`, `displayName`
- JAR with no `fabric.mod.json` → `null`, no throw
- Malformed JSON → `null`, no throw
- Not a ZIP at all (truncated/garbage file) → `null`, no throw
- `fabric.mod.json` present but missing `id` → `null` (unusable without a match key)
- `hashFile` matches a known-good SHA-256 fixture
- MC version normalization: `"1.21.4"` → `["1.21.4"]`; `">=1.21.4"` → `["1.21.4"]`; `["1.21.4", "1.21.5"]` → both; `"1.21.x"` → `[]` with `mcVersionsRaw` preserved; `depends` absent → `[]`

Fixtures: build small JARs in the test's temp dir rather than committing binaries.

**Done criteria:**
- All cases above pass
- No path in the module throws on bad input — every failure returns `null`

---

### Task 2 — `artifacts` Table and Queries (§12.2)

**Goal:** Persist per-artifact metadata.

**Files to create/modify:**
- `src/db/schema.ts` — add `artifacts` table:
  - `id` uuid pk, `buildId` fk → `build_runs.id` cascade, `repoId` fk → `repos.id` cascade
  - `filename` text notNull, `size` integer notNull, `sha256` text notNull
  - `modId` text nullable, `modVersion` text nullable, `displayName` text nullable
  - `loader` text notNull default `'fabric'`
  - `mcVersionsJson` text notNull default `'[]'`, `mcVersionsRaw` text nullable
  - `createdAt` timestamp notNull defaultNow
  - Index on `modId`
- `src/db/migrations/0003_*.sql` — generated via `pnpm drizzle-kit generate`
- `src/db/queries/artifacts.ts` — `insertArtifacts`, `listLatestArtifactsByModId`
- `src/db/queries/artifacts.test.ts`

`listLatestArtifactsByModId` returns, for each `modId`, artifacts from the most recent **successful** build of the owning repo — not the most recent build overall, and not merged across repos.

**Tests:**
- `insertArtifacts` round-trips all fields including null metadata
- `listLatestArtifactsByModId` returns only newest-successful-build rows; older builds excluded
- Failed builds excluded entirely
- Rows with null `modId` excluded
- Deleting a build cascades its artifacts

**Done criteria:**
- Migration applies cleanly against a fresh database
- `pnpm typecheck` passes
- Query tests pass

---

### Task 3 — Wire Extraction Into the Build Pipeline (§12.1)

**Goal:** Populate `artifacts` rows on every successful build.

**Files to modify:**
- `src/builder/artifacts.ts` — extend `storeArtifacts` (or add a sibling) to return `sha256` and `ModMetadata` alongside the existing `StoredArtifact` fields
- wherever the build run is recorded (build runner / scheduler) — insert artifact rows after the build run row exists
- `src/builder/artifacts.test.ts` — extend

**Constraint:** wrap extraction per-JAR in a try/catch. One unreadable JAR must not lose the metadata for the others, and must not fail the build (Decision 3).

**Tests:**
- Multi-JAR build populates one row per JAR
- A deliberately corrupt JAR among good ones → build still succeeds, that row has null metadata, others are intact
- Existing artifact-collection tests still pass unchanged (`-sources.jar` / `-dev.jar` exclusion, multi-project layouts)

**Done criteria:**
- A real build produces correctly populated `artifacts` rows
- No regression in `pnpm test`

---

### Task 4 — `CLIENT_API_TOKEN` Config (§12.4)

**Goal:** Add the token to config parsing and document it.

**Files to modify:**
- `src/config/env.ts` — add optional `CLIENT_API_TOKEN` to the Zod schema
- `src/config/env.test.ts` — present / absent cases
- `.env.example` — add with a placeholder and a one-line comment

**Done criteria:**
- Config parses with and without the variable set
- Never logged anywhere

---

### Task 5 — Manifest Endpoint (§12.3, §12.4)

**Goal:** `GET /api/manifest` returning the grouped manifest.

**Files to create/modify:**
- `app/api/manifest/route.ts`
- `app/api/manifest/route.test.ts`
- `middleware.ts` — add `/api/manifest` to `publicRoutes` so Auth.js doesn't intercept it; the route does its own bearer-token check

**Response shape:**
```jsonc
{
  "generatedAt": "2026-08-10T12:00:00.000Z",
  "mods": [
    {
      "modId": "examplemod",
      "displayName": "Example Mod",
      "repoId": "…", "repoName": "example-mod",
      "versions": [
        {
          "modVersion": "1.2.3", "loader": "fabric",
          "mcVersions": ["1.21.4"], "mcVersionsRaw": ">=1.21.4",
          "filename": "examplemod-1.2.3.jar", "sha256": "…", "size": 123456,
          "downloadUrl": "https://host/api/artifacts/<buildId>/<filename>",
          "buildId": "…", "builtAt": "…",
          "commitHash": "abc1234", "commitSummary": "…"
        }
      ]
    }
  ]
}
```

`commitHash` / `commitSummary` come from `build_runs.commitsJson` (newest commit of the triggering set). `downloadUrl` is built from `BASE_URL`.

**Tests:**
- Valid token → 200, correct grouping by `modId`
- Missing / malformed / wrong token → 401, identical body in all three cases
- `CLIENT_API_TOKEN` unset → 503, never 200
- Token comparison uses `crypto.timingSafeEqual` (guard length first — it throws on mismatched lengths)
- `?mc=1.21.4` filters correctly; `?mc=` with no match → empty `mods` array, still 200
- Artifacts with null `modId` absent from output
- A Stonecutter-style build with several MC versions produces one mod entry with several version entries

**Done criteria:**
- All tests pass
- `curl` with a valid token returns a usable manifest; without one returns 401
- Route is not reachable through the dashboard session cookie alone — token is the only key

---

### Task 6 — Backfill Script (Decision 7)

**Goal:** Populate `artifacts` for builds that predate this phase, using the JARs already on disk in `ARTIFACTS_DIR`.

**Files to create:**
- `scripts/backfill-artifacts.ts` — walk successful `build_runs` with `artifactPathsJson`, hash and extract each JAR still present on disk, insert missing rows
- add a `backfill:artifacts` script entry to `package.json`

**Behavior:** idempotent (skip builds that already have rows), tolerant of files deleted by `cleanupOldArtifacts`, and it reports how many builds and JARs it processed and skipped.

**Tests:** none required (one-off operational script), but it must be safe to run twice — verify manually against the dev database and report the output.

**Done criteria:**
- Running it twice produces no duplicate rows
- Manifest returns real data for pre-existing builds afterwards

---

### Task 7 — Surface Metadata in the Dashboard

**Goal:** Show extracted metadata on the build detail page so extraction failures are visible instead of silent.

**Files to modify:**
- `app/(dashboard)/repos/[id]/builds/[buildId]/page.tsx` — per-artifact mod id, mod version, MC versions, size, short SHA
- flag artifacts with null `modId` explicitly (e.g. "no fabric.mod.json — not served to clients")

**Tests:** none required (UI).

**Done criteria:**
- Build detail page lists artifacts with metadata
- JARs missing metadata are visibly marked rather than looking normal

---

## Acceptance

1. `pnpm test` passes with zero failures.
2. `pnpm typecheck` exits 0. `pnpm lint` exits 0.
3. Migration `0003_*` applies cleanly to a fresh database.
4. A real build populates `artifacts` rows with mod id, version, MC versions, SHA-256, and size.
5. A build containing an unparseable JAR still succeeds; that artifact is stored with null metadata and omitted from the manifest.
6. `GET /api/manifest` with a valid bearer token returns mods grouped by mod id, each with download URL, SHA-256, MC versions, and originating commit.
7. The endpoint returns 401 for missing/wrong tokens and 503 when `CLIENT_API_TOKEN` is unset. It never falls open.
8. `?mc=<version>` filters to matching artifacts.
9. Discord delivery (§6) is unchanged and still working — `artifact_paths_json` still populated, embeds still link correctly.
10. Backfill has been run and the manifest reflects pre-existing builds.
11. All code lives on `phase-5-manifest-api`. `main` untouched. `plans/phase-5.md` committed to the branch.

---

## Deferred / Out of Scope

- `modupdater-cli` and `modupdater-mod` — separate repositories, later phases (§12.6)
- Per-client tokens or client install tracking (§12.5)
- Consolidating `build_runs.artifact_paths_json` into the `artifacts` table (Decision 2)
- Dependency resolution between mods (§12.7)
- Mods the platform doesn't build (§12.7)
- Rate limiting implementation, if §9's limiter isn't already reusable as-is — note it and carry it forward rather than building a second one
