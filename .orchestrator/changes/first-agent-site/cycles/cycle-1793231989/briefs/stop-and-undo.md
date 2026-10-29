# Brief: Implementor, task stop-and-undo (change first-agent-site, cycle cycle-1793231989)

You are the Implementor for one task. Do exactly this task; do not add scope. Reference material below is to be pressure-tested, not deferred to: a seam row was written before any code existed, and if the code wants something else, implement what it needs and record a push-back in `## Discoveries`.

## Where things are

- Worktree (yours; already created, on branch `task-stop-and-undo-20261029-003429`, based on the integration branch with the tasks site-turn and fetch-tool merged, so `src/`, `server/app.ts` and `server/fetchTool.ts` exist): `/home/user/dynamic_ai_ui/.worktrees/task-stop-and-undo-20261029-003429`. Work and commit only here. Do not create worktrees; do not touch the main checkout `/home/user/dynamic_ai_ui` except the one task file named below. Other Implementors work in parallel on other tasks of the same files' neighbourhood; stay inside your task's scope so merges stay clean.
- Task file (read it in full first; it holds the summary, the cited seam rows verbatim, implementation steps, the pending tests to promote, out-of-scope): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/tasks/open/stop-and-undo.md`. You append `## Observations` and `## Discoveries` to that file by this absolute path and NEVER commit it.
- Design (D1-D13, all seam rows): `docs/changes/first-agent-site/design.org` in your worktree. Intent `docs/changes/first-agent-site/intent.org`; specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; vocabulary `docs/glossary.org` (use its terms; avoid the words it lists under Avoid). Do not modify anything under `docs/`.
- Tests already exist (pending ones are `it.fails`): `test/page-spec.test.ts`, `test/agent-loop.test.ts`, `test/data-fetch.test.ts`, harness `test/support/site.ts` and `load.ts`. Read `test/support/site.ts` first. The code under `src/` and `server/` was written by the previous tasks; read what you touch before changing it. Scaffold in place; node_modules resolves from the parent directory.
- Report path (orchestrator only): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reports/stop-and-undo.md`
- Your scratch directory (all scratch files only here): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/stop-and-undo/`

## What this task is


Make the Stop and Undo controls work (D5, D6): stopping aborts the turn's model request or tool run, applies nothing that arrives afterwards, keeps the page spec, and leaves every tool call answered (the second stop test stops a running fetch, hence after fetch-tool); undo puts back the copy taken when the last turn started, one step only, offered between turns. The next visitor message tells the model the page as undo left it.

## Cited seams

The rows are in the task file under "Cited seams". Relevant decisions are in design.org.

## Cited scenarios (text from docs/specs/) and coverage rows

### agent-loop § Stopping keeps edits already made
*** Scenario: Stopping keeps edits already made
- *WHEN* the visitor stops a turn after the assistant has added a card
- *THEN* the loop stops and the card stays
- *AND* undo removes it

### page-spec § Undo restores the page before the last turn
*** Scenario: Undo restores the page before the last turn
- *WHEN* the assistant's last turn removed a table the visitor wanted
- *AND* the visitor presses undo
- *THEN* the page spec, and so the page, is as it was before that turn

| capability | scenario | status | citations |
|-
| agent-loop | Stopping keeps edits already made | cited | test/agent-loop.test.ts:85 |
| page-spec | Undo restores the page before the last turn | cited | test/page-spec.test.ts:145 |

2 scenarios: 2 cited

(Status "cited" means a test cites it; those tests are pending `it.fails` until promoted.)

## Verification (run in your worktree, in the foreground, once, before the commit)

`npx vitest run --reporter=junit --passWithNoTests` (junit report on stdout). Promote (drop `.fails` from) exactly the tests the task file's Verification section lists; every other `it.fails` stays pending and green. A pending test outside the list that starts passing is promoted too and named in `## Observations`. Baseline at HEAD: 23 tests, 0 failures. Never leave a test run in the background; report once.

## Rules (from the Implementor role)

- One commit on your branch, message `Implement task stop-and-undo: <description>`, ending with the lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01P9sjxVDXNx2YmGcBRhu2oh
  The commit holds code and test changes only, never the task file, the report or `## Observations`/`## Discoveries`.
- Premises: before writing code check the task's claims against the worktree (names, signatures, harness expectations). A wrong claim the task can absorb is corrected in the work and noted in `## Observations`. A wrong claim that changes what the task should do, or a test you did not write that fails and can only be fixed by changing behaviour a cited row/scenario states: stop and hand back `blocked stop-and-undo: premise wrong, <claim>`. If a test you did not write is wrong without changing the stated behaviour, change it, say so in `deviation_summary`, hand back with `deviated`, and add a `## Discoveries` entry (class: deviation) quoting the assertion before and after.
- Before the commit, re-read the prose beside each change (comments, docstrings, error texts, the cited sentences) and grep the tree for each name or message the task changed; fix any sentence the work made untrue.
- Shared machine: never `git stash` (commit instead); no `git worktree prune`/`gc`/`remove`; scratch files only in your scratch directory; no fixed ports/sockets (a server you start is named after your branch and on a free port you chose); start no GUI or interactive program; stop only processes you started.
- Never create task files. A defect outside the task goes in `## Discoveries` and `candidate_tasks` in the report. Do not expand scope silently (the task file's Out-of-scope list stands).
- `## Observations`: departures from the prescribed approach with evidence, weak tests, ambiguities resolved, speculative needs as one `thought:` line. Defects outside the task are NOT observations; they are `## Discoveries`.
- `## Discoveries` format (append to the task file), entries like: discovery_id: disc-stop-and-undo-1 / class: one of shape-fragmentation, vocabulary-mismatch, responsibility-leakage, dead-branch, interface-drift, mutation, invariant-gap, spec-signal, deviation, scope-question, duplication / description / affected_seam / kind: issue or question / severity / evidence / recommendation. Push-backs on seam rows go here too.
- If the task body itself needs revision before it can be implemented, stop and hand back `blocked stop-and-undo: <what you observed and what it blocks>`.

## Structured report (write to the report path above; for the orchestrator only)

```yaml
task_name: stop-and-undo
commit_sha: <sha>
test_output_tail: |
  <last 10 lines of the test command output>
observations_count: <n>
discoveries_count: <n>
candidate_tasks:
  - <discovery_id of each defect outside the task>
push_backs:
  - seam: <seam-id>
    summary: <one line>
deviation_summary: <optional one line>
```

## Hand-back

Your last act is to hand back exactly one line, at most 200 characters, nothing else, no paths, no report text:

    done stop-and-undo <commit-sha>
    done stop-and-undo <commit-sha> deviated
    done stop-and-undo <commit-sha> candidates=<n>
    blocked stop-and-undo: <what you observed and what it blocks, one clause>
    failed stop-and-undo: <why, one clause>
