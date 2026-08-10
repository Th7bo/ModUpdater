# Phase 6 — `modupdater-cli`

**Scope:** 3-4 sessions
**Repository:** new — `modupdater-cli`, not this repo
**Branch:** `phase-6-cli` in the new repo
**Goal:** A standalone Java updater that runs from a launcher hook, diffs an instance's `mods/` folder against the platform manifest, shows the user what changed, and installs the JARs they accept — with a rollback path when a new build won't boot.

Depends on Phase 5's `GET /api/manifest` (REQUIREMENTS §12.3), which is complete and live-verified.

Implements REQUIREMENTS §12.6 (`modupdater-cli` half only). The `modupdater-mod` Fabric mod is Phase 7 and is deliberately not started here — the CLI is useful on its own, and it owns all file mutation either way.

---

## Why this is a separate repository

It is a Java/Gradle artifact with no TypeScript, no Next.js, and no database. It ships to users' machines rather than the VPS. Its only contract with the platform is the manifest JSON, which is versioned by §12.3.

---

## Decisions

1. **Java 21**, matching the platform's default build JDK. Distributed as a single shaded JAR.
2. **JSON parsing needs a dependency.** The JDK has no JSON parser. Gson is the choice — small, stable, shades cleanly. Hand-rolling a parser for a document we don't control is not worth it. *(This is a dependency decision for the new repo; CLAUDE.md's dependency rules govern this repo, but flagging it here so it's a conscious choice.)*
3. **HTTP via `java.net.http.HttpClient`** — built in, no dependency.
4. **Swing for the dialog** — built in. No JavaFX, no web view.
5. **Mod identification reuses the server's rules**: match on `fabric.mod.json` `id`, compare by SHA-256, and treat MC compatibility as exact-string matching against the manifest's `mcVersions`. The CLI does **not** parse version ranges — §12.1 put that on the server precisely so there is one implementation.
6. **Config precedence:** CLI flags > config file in the instance directory > environment. The token is read from a file with owner-only permissions, never passed as a command-line argument (process listings are world-readable).
7. **The CLI never relaunches the game itself.** It runs a user-supplied command string if one is configured (§12.6). Prism users point it at the Prism CLI; Modrinth App users leave it blank.

---

## Tasks

---

### Task 1 — Repository Scaffold

**Goal:** Buildable, testable skeleton producing a runnable shaded JAR.

- Gradle project, Java 21 toolchain, shadow plugin
- JUnit 5, `./gradlew test`
- `Main` with `check` / `apply` subcommands that currently do nothing but exit 0
- README stating what this is and which launchers it supports

**Done criteria:** `./gradlew build` produces a JAR that runs and exits 0 for both subcommands and for no arguments.

---

### Task 2 — Manifest Client (§12.3)

**Goal:** Fetch and parse the manifest.

- `ManifestClient.fetch(baseUrl, token, mcVersion)` → typed model mirroring §12.3
- Bearer auth, connect/read timeouts, one retry on connection failure
- Distinguishes: reachable-and-valid, 401, 503, unreachable, malformed body

**Tests** (JUnit + `com.sun.net.httpserver` stub, no network):
- Valid payload parses into the model, including several versions per mod
- 401 / 503 / timeout / malformed JSON each surface as distinct typed failures, never an exception escaping to `main`
- Bearer header is actually sent
- `?mc=` is included when a version is supplied

---

### Task 3 — Instance Scanner

**Goal:** Inventory the mods already installed.

- Read every `mods/*.jar`, extract `fabric.mod.json` (mod id, version), compute SHA-256
- Ignore `.disabled` files and subdirectories
- An unreadable JAR is reported as unmatched, never fatal

**Tests:**
- Mixed folder: valid mods, a non-JAR, a corrupt JAR, a `.disabled` file
- SHA-256 matches a known fixture
- Empty and missing `mods/` directories both return empty rather than throwing

---

### Task 4 — Diff Engine

**Goal:** Decide what is updatable. Pure functions, no I/O — this is the part that must be provably right.

An installed mod is **updatable** when the manifest has an entry with the same mod id, whose `mcVersions` contains the instance's MC version, and whose SHA-256 differs from what's installed.

**Tests:**
- Same id, different SHA, matching MC version → updatable
- Same id, same SHA → not updatable (the common case; must not offer a no-op)
- Same id, different SHA, non-matching MC version → **not** offered
- Empty `mcVersions` (unresolved constraint per §12.1) → not offered, surfaced as unknown compatibility
- Mod in manifest but not installed → not offered (this is an updater, not an installer)
- Installed mod absent from manifest → left alone
- Two repos publishing the same mod id → both surfaced as distinct choices, never silently merged

---

### Task 5 — Install with Rollback

**Goal:** Replace JARs safely. The riskiest task in the phase.

- Download to a temp file, verify SHA-256 **before** it goes near `mods/`
- Move the outgoing JAR to `.modupdater/backup/`, then move the new one in
- Write `.modupdater/pending.json` recording what changed
- On the next `check` run, a `pending.json` with no success marker means the previous launch failed → restore from backup and tell the user which mod did it
- `apply` writes the success marker once a launch has been confirmed

**Tests:**
- Hash mismatch → nothing enters `mods/`, temp file cleaned up
- Interrupted mid-install (simulated failure between move-out and move-in) → backup still holds the original and restore recovers it
- Restore returns the folder to its exact prior state, byte-for-byte
- Two consecutive successful updates leave exactly one backup generation, not an unbounded pile

---

### Task 6 — Swing Dialog

**Goal:** The user-facing half of `check`.

- Table of updatable mods: name, installed → available version, MC version, size, commit summary from the manifest
- Per-row checkboxes, select-all, **Update**, **Skip**
- Progress during download; per-mod success/failure at the end
- Headless-safe: if no display is available, log what would change and exit 0 without blocking

**Tests:** the dialog is manual, but the view-model that feeds it (row construction, button-state rules, headless detection) is unit tested.

---

### Task 7 — CLI Entry and Exit-Code Contract

**Goal:** Wire it together under the rule that makes or breaks usability.

- `check`: fetch → scan → diff → dialog → install → exit
- `apply`: headless; restore-if-failed, then run the configured relaunch command if set
- **Exit 0 on every non-fatal path** — user skips, server unreachable, 401, 503, timeout, no updates, no display. A non-zero exit from a pre-launch hook blocks the launch and reads to the user as a broken launcher.
- Non-zero only when the user explicitly chooses to abort the launch
- All output also goes to `.modupdater/log.txt`; the token is never logged

**Tests:**
- Exit code is 0 for: no updates, server down, 401, 503, malformed manifest, user skip, headless
- Exit code is non-zero only for explicit abort
- The token never appears in the log file

---

### Task 8 — Launcher Integration and Docs

**Goal:** Make it installable by someone who isn't us.

- Wrapper scripts (`.sh` and `.bat`) that read `$INST_MC_DIR` / `$INST_ID` internally rather than taking them as arguments — Prism does not escape those variables and they cannot be quoted in the hook field, so any instance path containing a space breaks otherwise (PrismLauncher#2690)
- Setup docs for **Prism** (pre-launch + post-exit, relaunch via the Prism CLI) and **Modrinth App** (pre-launch + post-exit, no relaunch available — modrinth/code#2985)
- Token setup: where the file goes, why it's owner-only

**Done criteria:** a clean instance on both launchers can be configured from the README alone, and an instance path with a space in it works.

---

## Acceptance

1. `./gradlew build` and `./gradlew test` pass.
2. Pointed at a real platform manifest with a valid token, `check` lists genuinely outdated mods in an instance and installs the selected ones.
3. A tampered download (wrong SHA-256) never reaches `mods/`.
4. Deleting a JAR mid-session and re-running restores cleanly from backup.
5. Exit code is 0 for every failure mode in Task 7; verified by test, not by inspection.
6. A mod built for a different MC version than the instance is never offered.
7. Works end-to-end on Prism and on Modrinth App, including an instance path containing a space.
8. The token appears in no log file and in no process argument list.

---

## Deferred / Out of Scope

- `modupdater-mod` — Phase 7 (§12.6)
- Installing mods not already present (§12.7)
- Dependency resolution (§12.7)
- Launchers without pre-launch/post-exit hooks, including the official launcher (§12.6)
- Auto-relaunch beyond running a user-supplied command (Decision 7)
