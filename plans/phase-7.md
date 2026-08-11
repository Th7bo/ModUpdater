# Phase 7 — `modupdater-mod`

**Scope:** 3-4 sessions
**Repository:** new — `modupdater-mod`, public, so the platform can clone and build it
**Goal:** Notice updates *during* a session instead of only at launch, and let the user accept them without hunting through the launcher. Also replaces the CLI's session-length guess with a real signal that the game loaded.

Implements the `modupdater-mod` half of REQUIREMENTS §12.6, deferred out of phase 6.

---

## Verified toolchain

Checked against Fabric's meta API and the user's own running instance, not assumed:

| | |
|---|---|
| Minecraft | `26.1.2` |
| Fabric Loader | `0.19.3` (meta API, for 26.1.2) |
| Fabric API | `0.155.2+26.1.2` (Modrinth; matches the instance) |
| Loom | `1.17.19` (latest stable; 1.18 is alpha) |
| Mappings | **Mojang official** |
| Java | target 21 — the runtime is 25, Mixin reports compat level JAVA_25 |

**Yarn has no mappings for 26.1.2** — `/v2/versions/yarn/26.1.2` returns `[]`. The instance log confirms the ecosystem is on Mojang names (`net.minecraft.client.Minecraft`, `net.minecraft.world.scores.Scoreboard`, not Yarn's `MinecraftClient`). Using Yarn here is simply not an option.

---

## Decisions

1. **The mod never modifies a JAR.** By the time any in-game code runs, Fabric Loader holds every mod JAR open. The mod writes a request; the existing post-exit hook does the swap, when nothing is loaded. This is the whole reason the CLI exists separately and is not negotiable.
2. **Separate repo, and the platform builds it.** It is an ordinary Fabric mod, so it goes through the same pipeline as every other tracked repo and reaches users through the same manifest — the updater updates itself. That works only because swaps happen pre-launch; an in-process self-updater could not do this.
3. **No Kotlin.** The instance has `fabric-language-kotlin`, but depending on it for a mod this small adds a dependency and a failure mode for nothing.
4. **Reuses the CLI's config, not its own.** `base.url` from `<gameDir>/modupdater.properties` and the token from `<gameDir>/mods/.modupdater/token` — both already written by the installer. Nothing new to configure, and no second copy of the token.
5. **The mod is optional.** Everything keeps working without it; it only adds mid-session notice and a better launch signal.

---

## Tasks

---

### Task 1 — Repo Scaffold

**Goal:** A mod that builds and loads, and does nothing else.

- Loom `1.17.19`, Mojang mappings, Java 21, Fabric API `0.155.2+26.1.2`
- `fabric.mod.json` with id `modupdater`, **client-only** (`"environment": "client"`)
- A client entrypoint that logs its version on init

**Done criteria:** `./gradlew build` produces a JAR; dropping it into the test instance loads without errors and logs on startup.

---

### Task 2 — Manifest Polling

**Goal:** Know what is available, without blocking the game.

- Read `base.url` and the token from the CLI's files; if either is missing, disable silently — a mod that nags about configuration it can fix is worse than one that stays quiet
- Poll on a background thread: once ~30s after the title screen, then every 15 minutes
- Reuse the CLI's manifest model and matching rules by **publishing `modupdater-cli` as a library the mod depends on**, so `mcVersionMatch`, hashing and diffing have exactly one implementation across all three pieces
- Never touch the network from the render thread

**Tests:** the polling schedule and the disable-when-unconfigured rule, against a stub.

---

### Task 3 — Detecting What Is Installed

**Goal:** Diff against the running game rather than re-scanning a folder.

- `FabricLoader.getAllMods()` → mod id, version, and JAR path via `ModContainer.getOrigin()`
- SHA-256 those JARs once, on a background thread, and cache — 97 mods at ~34 MB each is not something to redo every poll
- Feed into the CLI's existing `Differ`

**Tests:** origin paths that are directories (dev environment) or nested JARs are skipped rather than crashing.

---

### Task 4 — Toast and Screen

**Goal:** Tell the user, without interrupting them.

- A vanilla toast when the poll finds something: "2 mod updates available"
- A screen listing them — same columns as the CLI dialog — reachable from the toast and from Mod Menu
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

- **A new MC version with no Yarn mappings** means fewer references to copy from; Mojang mappings are well supported by Loom but most tutorials are written in Yarn.
- **Nothing here can be tested without launching the game.** Unit tests cover the CLI-side changes; the mod's own behaviour needs a real session every time, which makes iteration slow.
- **97 mods, ~34 MB each** — hashing must be cached and off-thread or it will be felt.
- Publishing the CLI as a library couples the two repos. Worth it to avoid a third copy of the version-matching rules, but it means the mod needs a CLI release to build against.

---

## Deferred

- Downloading updates in the background during play (the swap still cannot happen until exit, so it saves only download time)
- Any server-side component
- Mods the platform does not build
