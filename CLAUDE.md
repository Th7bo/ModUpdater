# CLAUDE.md

Working agreements for Claude Code on the Mod CI/CD Platform project. Read this before starting any task.

## Project overview

A self-hosted platform that tracks Minecraft Fabric mod repositories (public upstreams and personal forks on GitHub), detects new commits, builds the mods via Gradle, and delivers the resulting `.jar` files plus commit summaries to Discord via a bot.

`REQUIREMENTS.md` in the repo root is the source of truth for what the product is. This file (`CLAUDE.md`) covers *how* we work.

## Source of truth

- `REQUIREMENTS.md` defines what to build. If something contradicts it, REQUIREMENTS wins.
- `plans/phase-N-*.md` defines what to build *now* and in what order.
- When implementing anything non-trivial, cite the REQUIREMENTS section you're working from (e.g., "implementing webhook validation from §8").
- If REQUIREMENTS is ambiguous on something you need to decide, stop and ask. Do not invent answers.
- If you believe REQUIREMENTS has a bug, raise it explicitly. Do not silently work around it.

## Working style

- **One branch per phase.** At the start of each phase, create a branch named `phase-N-short-name` off `main`. All work for that phase lands on that branch. Do not commit to `main` directly during a phase.
- **Verify the branch before starting work.** Run `git branch --show-current` as the first thing in each session. If you're on `main` or the wrong phase branch, stop and ask before doing anything else.
- **Phase close-out merges to `main`.** When the phase's acceptance criteria are all met and confirmed, the branch is merged to `main`. Do not merge without being told to.
- **Work one task at a time from the active plan.** After completing a task, stop, summarize what changed, and wait for confirmation before moving to the next task.
- **Small commits.** One logical change per commit, with a message that references the plan task it completes (e.g., `phase-1 task 3: add polling scheduler`).
- **Tests alongside implementation, not after.** When you write a function that has tests in the plan, write the tests in the same task and run them before claiming the task is done.
- **Run what you change.** After editing code, run the relevant test command and report the output. Don't claim something works without evidence.
- **Don't over-deliver.** If the task is "add polling for a repo," don't also wire up the Discord notifier or build runner. Scope creep is the project killer.

## Shell commands

You are running in the project root directory on Windows with PowerShell. Follow these rules to avoid unnecessary approval prompts and keep commands clean.

- **Never prefix commands with `cd`.** You are already in the project root. Run commands directly.
- **One command per tool call.** Do not chain with `;`, `&&`, `||`, or pipes unless the task genuinely requires it. Compound commands trigger extra approval prompts.
- **Never append `2>&1` to commands.** pnpm, npm, git, and node already write their output to stdout. Adding `2>&1` is unnecessary.
- **Trust your working directory.** If you suspect you're in the wrong place, run `Get-Location` as a separate command first.
- **Use PowerShell-native verbs when possible** (`Get-ChildItem`, `Get-Content`, `Select-String`, `Test-Path`) over their Unix aliases, since allow rules target them directly.

## Asking for confirmation

Stop and ask before:
- Adding a dependency not listed in REQUIREMENTS §2 (tech stack).
- Changing the database schema in a way that diverges from REQUIREMENTS.
- Changing the webhook endpoint shape or signature validation logic (§9).
- Touching the build runner or Gradle invocation logic (§5) — incorrect builds produce wrong artifacts.
- Touching the SSH key generation or storage logic (§8) — mistakes here could expose private keys.
- Touching the rebase/conflict logic for fork repos (§4.2) — mistakes here could corrupt the fork's git history.
- Introducing a new abstraction or pattern that isn't already in the codebase.

Don't ask before:
- Choosing reasonable variable names, file structure inside an established directory, or test names.
- Routine refactors that keep behavior identical.
- Adding inline code comments where they help.

## Code style

- TypeScript strict mode, no `any`, no `@ts-ignore` without a comment explaining why.
- Functional patterns preferred; avoid classes unless wrapping an external API that demands it.
- Server-side only — there is no client-side game logic here. The web UI is a thin management layer.
- Use the ORM/query builder consistently, not raw SQL, unless there is a measurable reason.
- Prefer named exports over default exports.
- Import order: external packages, then `@/` internal imports, then relative imports. Separated by blank lines.
- File naming: kebab-case for all files and directories.

## Project structure

```
/app                    Next.js App Router
  /api                  API route handlers
    /webhooks           GitHub webhook endpoints
    /repos              Repo management endpoints
    /settings           Global settings endpoints
  /(dashboard)          Web UI pages (React, protected by Auth.js)
/src
  /builder              Gradle build runner, artifact collection, Stonecutter detection
  /discord              discord.js client, message formatting, file delivery
  /git                  simple-git helpers, rebase logic, SSH key management
  /scheduler            Polling scheduler, debounce logic, build queue
  /db                   Drizzle schema, client, queries (PostgreSQL)
  /config               Config loading and validation (Zod)
/plans                  Phase implementation plans
REQUIREMENTS.md         Source of truth for product spec
CLAUDE.md               This file
```

When adding a new module, place it consistently with this structure. If something doesn't fit, ask before creating a new top-level directory.

## Testing

- Vitest for unit tests. Co-locate tests next to the code: `poller.ts` and `poller.test.ts` in the same directory.
- Run `pnpm test` after any change to code under test. Report pass/fail counts.
- Critical areas that must have tests:
  - **Debounce logic:** assert that multiple rapid triggers within the window produce a single deferred build, and that the timer resets on each new trigger.
  - **Stonecutter detection:** assert correct detection with and without `stonecutter.gradle` present, and that the right build task is selected.
  - **Artifact collection:** assert correct JAR filtering (excludes `-sources.jar`, `-dev.jar`), including multi-project layouts.
  - **Webhook signature validation:** assert that valid and tampered payloads are correctly accepted/rejected.
  - **Rebase conflict detection:** assert that a failed rebase aborts cleanly and leaves the repo in its original state.

## Critical behaviors — do not change without explicit instruction

- **Debounce timer resets on each new commit event** (§10). Do not implement as a simple one-shot delay.
- **Rebase conflicts must abort and restore** before notifying Discord (§4.2.1). Never leave the repo in a mid-rebase state.
- **SSH private keys are stored with `600` permissions** (§8). Verify this after writing any key to disk.
- **Webhook payloads must be signature-validated** before any action is taken (§9). Never process an unvalidated payload.
- **Build concurrency is capped** at the configured limit (default 2) (§10). Never allow unbounded parallel builds.

## Security defaults

- Never log SSH private keys, Discord bot tokens, webhook secrets, or any other credentials.
- Validate all incoming webhook payloads with `X-Hub-Signature-256` before processing.
- Validate all web UI input at the API boundary (use Zod schemas).
- The web UI must be protected by authentication (HTTP Basic Auth at minimum) — no unauthenticated access to management endpoints.
- Rate limit webhook endpoints to mitigate abuse.

## Environment variables

Listed in `.env.example`. When you need a new env var, add it to `.env.example` with a placeholder value and a one-line comment. Never commit real secrets.

Key variables (at minimum):
```
DISCORD_BOT_TOKEN=        # Discord bot token
WEBHOOK_SECRET=           # Global or per-repo GitHub webhook secret
WEB_AUTH_USER=            # Web UI basic auth username
WEB_AUTH_PASS=            # Web UI basic auth password
DB_PATH=./data/db.sqlite  # Path to SQLite database file
SSH_KEYS_DIR=./data/keys  # Directory for SSH key pairs
BUILD_CONCURRENCY=2       # Max parallel Gradle builds
DEBOUNCE_MS=60000         # Build debounce delay in milliseconds
```

## Dependencies

Allowed without asking: anything already in `package.json`, dev-only tooling (ESLint configs, type stubs, Vitest plugins).

Ask first for: any runtime dependency not already installed. Cite why it's needed and what writing it ourselves would cost.

Never add: frontend state management libraries, CSS-in-JS libraries, ORM alternatives to Drizzle, auth alternatives to Auth.js, Discord library alternatives to `discord.js`, raw `child_process` shell calls as a substitute for `simple-git`.

## Common mistakes to avoid

- Triggering a build immediately on commit detection — always go through the debounce queue.
- Leaving a repo in a mid-rebase state on conflict — always abort and restore first, then notify.
- Scanning only the top-level `build/libs/` for JARs — multi-version Stonecutter builds output to sub-project directories too.
- Including `-sources.jar` or `-dev.jar` in Discord file attachments.
- Storing SSH private keys with world-readable permissions.
- Processing a GitHub webhook payload without first verifying the signature.
- Starting more than `BUILD_CONCURRENCY` Gradle processes simultaneously.

## When stuck

If a task in the plan is blocked or seems wrong:
1. State the problem clearly.
2. Propose 2–3 options with tradeoffs.
3. Wait for direction.

Do not silently substitute a different approach.