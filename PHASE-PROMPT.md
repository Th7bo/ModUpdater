# Per-Phase Prompt Template

Use this prompt whenever you want to start a new phase. Fill in the bracketed parts.

---

## Step 1 — Generate the plan

Use this prompt in a fresh Claude Code session (or with Claude in the chat UI) to generate the implementation plan for the phase. Don't have Claude Code start implementing yet — just produce the plan file.

```
Read REQUIREMENTS.md and CLAUDE.md carefully.

Draft plans/phase-[N].md covering whatever you think is needed.

The plan must:
- Be scoped to roughly 2-3 sessions"
- Cite REQUIREMENTS section numbers for every task
- Break the work into discrete tasks, each independently completable and testable
- For each task: state the goal, list files to create or modify, list any tests to write, and define "done" criteria
- End with an "Acceptance" section listing what must be true for the phase to be considered complete
- Flag any open questions that need a decision before implementation can start
- Not include code — plans describe intent, code lives in the implementation

Do not start implementing. Output only the plan file. Stop when the plan is written.
```

After Claude produces the plan, **review it before moving to step 2.** Look for:
- Tasks that try to do too much at once
- Missing test coverage on game-critical logic (deal, evaluator, badges)
- Assumptions that contradict REQUIREMENTS
- Dependencies on later phases ("this requires the leaderboard from Phase 6...")

Push back on the plan until it's right. This is the cheap step to fix things.

---

## Step 2 — Implement the plan

Once the plan is good, use this prompt to start implementation:

```
Implement plans/phase-[N]-[short-name].md.

Working agreement for this session:
- Complete one task at a time, in plan order.
- After each task: summarize what changed, run the relevant tests, report results, and stop. Wait for me to say "continue" before starting the next task.
- If you encounter a decision not covered by the plan or REQUIREMENTS, stop and ask. Do not invent answers.
- Commit after each completed task with a message referencing the task.

Start with task 1.
```

Then for each task, you'll:
1. Watch Claude Code complete it
2. Read the summary and test output
3. Either say "continue" or push back on something
4. Commit if you haven't already

---

## Step 3 — Close out the phase

When all tasks are done, use this prompt:

```
Phase [N] is complete. Verify against the Acceptance section of plans/phase-[N]-[short-name].md.

For each acceptance criterion, state whether it's met and how you verified.

If anything is unmet, list what's outstanding. Do not start fixing — just report.
```

If everything's met: commit, push, deploy if relevant, and move to the next phase.

If something's unmet: decide whether it's truly missing or whether the acceptance criterion was overscoped. Adjust one of them and continue.

---

## Tips that apply every phase

**Resist sprinting.** Claude Code will happily blast through six tasks in one go if you let it. The one-task-at-a-time rule exists because review costs scale superlinearly with batch size — three small reviews are easier than one big one.

**Read every commit before pushing.** Even with the task-by-task workflow, occasional surprises sneak in. `git diff` is your friend.

**Keep the chat session focused.** Once a phase is done, start a new session for the next phase. Long sessions accumulate context that's no longer relevant and Claude Code gets slower and more drift-prone.

**When something feels off, stop.** If the code looks weird, the tests pass but you don't trust them, or Claude Code is doing something you didn't ask for — pause and ask "explain what you just did and why." Don't keep accumulating changes on top of a confused state.

**Keep notes per phase.** A short paragraph after each phase about what was harder than expected, what shortcuts you took, what you'd do differently. By Phase 5 these are gold.
