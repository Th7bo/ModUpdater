# Phase 7 — `modupdater-mod`

**Scope:** 3-4 sessions
**Repository:** new — `modupdater-mod`, public, so the platform can clone and build it
**Goal:** Notice updates *during* a session instead of only at launch, and let the user accept them without hunting through the launcher. Also replaces the CLI's session-length guess with a real signal that the game loaded.

Implements the `modupdater-mod` half of REQUIREMENTS §12.6, deferred out of phase 6.

---

## Verified toolchain

Taken from `../Sidequest`, which already builds against these exact Minecraft versions, rather than from what the meta API suggests. Everything below is known-good in practice.

| | |
|---|---|
| Minecraft | `26.1.2` and `26.2` |
| Mappings | **none — Minecraft 26.1+ ships unobfuscated** |
| Stonecutter | `dev.kikugie.stonecutter` `0.9.7` |
| Fabric Loom | `1.17.17` |
| Fabric Loader | `0.19.3` |
| Fabric API | `0.155.2+26.1.2` / `0.156.0+26.2` |
| Kotlin | `2.4.10`, via `fabric-language-kotlin 1.13.13+kotlin.2.4.10` |
| Java | **25** for the Minecraft module, 21 for plain JVM modules |
| Gradle | `9.6.1` |

Three corrections to the first draft of this plan, all found by reading Sidequest:

- **There are no mappings.** Not Yarn, not Mojang. 26.1+ is unobfuscated, so Loom creates no `mod*` remapping configurations at all. The earlier note about Yarn returning `[]` was true but beside the point.
- **Java 25, not 21**, for anything on Minecraft's classpath.
- **Kotlin, not Java.** The earlier "no Kotlin" decision was wrong for this ecosystem: `fabric-language-kotlin` is already in the instance, and every neighbouring mod here is Kotlin.

Two consequences worth carrying over from Sidequest's build file, both of which cost it real debugging:

- `fabric-loader` must be `implementation`, not `compileOnly` — Loom takes the dev-launch loader from the runtime classpath, and declaring it compile-only makes the launcher silently fall back to an older bundled loader.
- Loom's `include` nests exactly the jars it is handed and does not follow a module's own project dependencies, so every nested module has to be listed explicitly or it dies with `NoClassDefFoundError` on someone else's client.

---

## Decisions

1. **The mod never modifies a JAR.** By the time any in-game code runs, Fabric Loader holds every mod JAR open. The mod writes a request; the existing post-exit hook does the swap, when nothing is loaded. This is the whole reason the CLI exists separately and is not negotiable.
2. **Separate repo, and the platform builds it.** It is an ordinary Fabric mod, so it goes through the same pipeline as every other tracked repo and reaches users through the same manifest — the updater updates itself. That works only because swaps happen pre-launch; an in-process self-updater could not do this.
3. **Kotlin, and Stonecutter for multiple Minecraft versions**, matching Sidequest. Targets `26.1.2` and `26.2` from one source tree.
4. **Reuses the CLI's config, not its own.** `base.url` from `<gameDir>/modupdater.properties` and the token from `<gameDir>/mods/.modupdater/token` — both already written by the installer. Nothing new to configure, and no second copy of the token.
5. **The mod is optional.** Everything keeps working without it; it only adds mid-session notice and a better launch signal.
6. **No shared library between the mod and the CLI, and no version-matching logic in the mod.** The mod requests `?mc=<version>` and the server does the filtering it already does correctly, so the mod only has to compare SHA-256 values. That removes the reason to publish `modupdater-cli` as a dependency, and with it the coupling and the release-ordering problem — while still leaving exactly one implementation of the range rules, on the server.
7. **No hand-written UI framework, and not Sidequest's.** A library gets chosen when Task 4 is reached; nothing before then depends on the answer.

---

## Tasks

---

### Task 1 — Repo Scaffold

**Goal:** A mod that builds and loads, and does nothing else.

- Stonecutter with targets `26.2` and `26.1.2`, per-version catalogs under `gradle/`, Loom `1.17.17`, Kotlin, Java 25, no mappings
- `fabric.mod.json` with id `modupdater`, **client-only** (`"environment": "client"`), depending on `fabric-language-kotlin`
- A client entrypoint that logs its version on init

**Done criteria:** `./gradlew build` produces a JAR per target; dropping the 26.1.2 one into the `testing` instance loads with no errors and logs on startup.

---

### Task 2 — Manifest Polling

**Goal:** Know what is available, without blocking the game.

- Read `base.url` and the token from the CLI's files; if either is missing, disable silently — a mod that nags about configuration it can fix is worse than one that stays quiet
- Poll on a background thread: once ~30s after the title screen, then every 15 minutes
- Request `?mc=<version>` so the server applies the range rules; the mod compares hashes and nothing else (Decision 6)
- Never touch the network from the render thread

**Tests:** the polling schedule and the disable-when-unconfigured rule, against a stub.

---

### Task 3 — Detecting What Is Installed

**Goal:** Diff against the running game rather than re-scanning a folder.

- `FabricLoader.getAllMods()` → mod id, version, and JAR path via `ModContainer.getOrigin()`
- SHA-256 those JARs once, on a background thread, and cache — 97 mods at ~34 MB each is not something to redo every poll
- An update is anything whose SHA-256 differs from what the filtered manifest offers

**Tests:** origin paths that are directories (dev environment) or nested JARs are skipped rather than crashing.

---

### Task 4 — Toast and Screen

**Goal:** Tell the user, without interrupting them.

- A vanilla toast when the poll finds something: "2 mod updates available"
- A screen listing them — same columns as the CLI dialog — reachable from the toast and from Mod Menu, built with a UI library chosen at this point (Decision 7)
- Buttons: **Update on exit** and **Update and quit now**
- No modal interruption mid-game, ever

**Done criteria:** toast appears on the title screen; the screen renders correctly at the instance's GUI scale.

---

### Task 5 — The Request File

**Goal:** Hand the decision to the CLI.

- Write `<gameDir>/mods/.modupdater/request.json`: which mod ids, from which build, and whether a restart was asked for
- *Update and quit now* writes it and calls a clean shutdown, so worlds save
- **CLI change:** `apply` must honour a request — download, verify, install, then clear it. Today `apply` only confirms or rolls back.

**Tests (CLI side):** a request installs exactly the listed mods; a stale or malformed request is ignored rather than acted on; a request naming a build that no longer exists fails safely.

---

### Task 6 — Replace the Session-Length Guess

**Goal:** Stop treating a short session as a crash.

The CLI currently rolls back if the session after an update lasted under two minutes, because the post-exit hook fires whether the game played or died on init. That misfires on a legitimately quick quit.

- The mod writes `launch-ok` once the client reaches the title screen
- **CLI change:** if that marker exists, confirm regardless of duration; fall back to the two-minute heuristic when the mod is absent
- Clear the marker at install time so it always describes the current attempt

**Tests:** marker present → confirmed even after 10s; marker absent → existing heuristic; marker stale from a previous install → ignored.

---

### Task 7 — Ship It Through the Platform

**Goal:** The updater updates itself.

- Register `modupdater-mod` as a repo in the platform so it builds and lands in the manifest
- **Installer change:** offer "also install the in-game notifier?" and pull the JAR straight from the manifest — otherwise first-time install is a manual download, which is exactly the friction this project exists to remove
- Document the bootstrap: the mod arrives like any other mod, and updates the same way

**Done criteria:** a fresh instance gets the mod from the installer, and a later platform build of the mod is offered as a normal update.

---

## Acceptance

1. `./gradlew build` passes in the mod repo; CLI tests still pass.
2. The mod loads in the real instance with no errors in the log.
3. With an update available, a toast appears and the screen lists it correctly.
4. *Update on exit* → quitting installs it; the next launch runs the new build.
5. *Update and quit now* → the world saves, the game exits, the update installs.
6. A quick quit after an update is **not** rolled back when the mod is installed.
7. With the mod absent, every phase-6 behaviour is unchanged.
8. The mod itself can be updated by the CLI through the manifest.

---

## Risks

- **Unobfuscated Minecraft is recent enough that most documentation is out of date**, describing `mappings` and `mod*` configurations that no longer apply. Sidequest is the reference, not the internet.
- **Nothing here can be tested without launching the game.** Unit tests cover the CLI-side changes; the mod's own behaviour needs a real session every time, which makes iteration slow.
- **97 mods, ~34 MB each** — hashing must be cached and off-thread or it will be felt.
- Two Minecraft targets double what has to be verified by hand, and only 26.1.2 can be tested on this machine's instance.

---

## Deferred

- Downloading updates in the background during play (the swap still cannot happen until exit, so it saves only download time)
- Any server-side component
- Mods the platform does not build

---

## Status — complete (2026-08-11)

All 7 tasks implemented on `main` (no phase branch, per the working preference
set during phase 6). `modupdater-mod`: 45 core tests, both Stonecutter targets
build clean. `modupdater-cli`: 138 tests.

Verified in the real 26.1.2 instance: the mod loads, the toast fires, the screen
lists updates with their commits, and *Update and quit now* installs on the next
launch. Acceptance 1-5 and 7-8 met. **Acceptance 6 was met only after a fix** —
see below.

**Deviations from the plan as written:**

- **Task 4 grew a changelog view.** The screen shows every commit between the
  installed build and the one on offer, which needed a new `/api/changelog`
  endpoint on the platform. Requested mid-phase.
- **A `core` module was added.** Stonecutter runs tests per Minecraft target, and
  only the active node compiles `src/` directly, so tests ran once for the wrong
  node and not at all for the other. Everything Minecraft-free moved to `core/`,
  which compiles once at Java 21 and is nested into both jars.
- **Stock widgets, not a UI library.** Modern UI and LDLib were both considered;
  neither has a Fabric build covering 26.1.2 and 26.2, and either would have been
  a second mod for every user to install.
- **A "Your mods" tab was added after the phase.** Lists every installed mod and
  whether the platform built it. Not in the plan; asked for once the rest worked.

**Bugs this phase surfaced, all found by real use rather than by testing:**

- The manifest offered *older* builds, because stale jars sat in `build/libs` and
  every one was published. It now publishes only the newest release per Minecraft
  version. Two mods flip-flopped every launch until this was fixed.
- `>=26.1` was read as the single version `26.1`, so a 26.1.2 instance was offered
  nothing. Open lower bounds are now treated as a prefix.
- Fork-sync merge commits filled the changelog with noise.
- **Acceptance 6 was passing for the wrong reason.** The pre-launch hook called
  `restoreIfUnconfirmed` directly and never read the launch marker this task
  added, so *every* update was reverted at the next launch regardless of session
  length — including one that discarded 8.5 hours. Only the post-exit hook, which
  does not run when the game has to be killed, ever confirmed anything. Both
  hooks now go through `resolveAfterSession`.

**Still open:**

- The screen has no automated coverage; it needs a running game.
- A mod wedges the JVM in a shutdown hook, so the game has to be killed and the
  post-exit hook never runs. Mitigated by also settling at pre-launch, but the
  culprit is unidentified — `kill -3` on the next occurrence.
- `modupdater-mod` has no CI; both targets are built by hand.
