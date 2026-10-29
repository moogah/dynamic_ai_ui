# Brief: Implementor, task chart-and-actions (change first-agent-site, cycle cycle-1793231989)

You are the Implementor for one task. Do exactly this task; do not add scope. Reference material below is to be pressure-tested, not deferred to: a seam row was written before any code existed, and if the code wants something else, implement what it needs and record a push-back in `## Discoveries`.

## Where things are

- Worktree (yours; already created, on branch `task-chart-and-actions-20261029-003429`, based on the integration branch with the tasks site-turn and fetch-tool merged, so `src/`, `server/app.ts` and `server/fetchTool.ts` exist): `/home/user/dynamic_ai_ui/.worktrees/task-chart-and-actions-20261029-003429`. Work and commit only here. Do not create worktrees; do not touch the main checkout `/home/user/dynamic_ai_ui` except the one task file named below. Other Implementors work in parallel on other tasks of the same files' neighbourhood; stay inside your task's scope so merges stay clean.
- Task file (read it in full first; it holds the summary, the cited seam rows verbatim, implementation steps, the pending tests to promote, out-of-scope): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/tasks/open/chart-and-actions.md`. You append `## Observations` and `## Discoveries` to that file by this absolute path and NEVER commit it.
- Design (D1-D13, all seam rows): `docs/changes/first-agent-site/design.org` in your worktree. Intent `docs/changes/first-agent-site/intent.org`; specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; vocabulary `docs/glossary.org` (use its terms; avoid the words it lists under Avoid). Do not modify anything under `docs/`.
- Tests already exist (pending ones are `it.fails`): `test/page-spec.test.ts`, `test/agent-loop.test.ts`, `test/data-fetch.test.ts`, harness `test/support/site.ts` and `load.ts`. Read `test/support/site.ts` first. The code under `src/` and `server/` was written by the previous tasks; read what you touch before changing it. Scaffold in place; node_modules resolves from the parent directory.
- Report path (orchestrator only): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reports/chart-and-actions.md`
- Your scratch directory (all scratch files only here): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/chart-and-actions/`

## What this task is


Complete the renderer for the catalog's remaining types (D9, D13, D8): chart (line, bar, pie) bound to page-spec data by path, drawn with `data-chart-kind` and `data-point-count`; image loaded only through the server under the allowlist; button and form that send a visitor message through the loop (a button its label, a form its filled-in fields).

## Cited seams

The rows are in the task file under "Cited seams". Relevant decisions are in design.org.

## Cited scenarios (text from docs/specs/) and coverage rows

### data-fetch § Fetch then display
*** Scenario: Fetch then display
- *WHEN* the weather API is on the allowlist
- *AND* the visitor asks "show the weather for Lisbon as a chart"
- *THEN* the assistant fetches the forecast and a chart of it appears on the page

### page-spec § Data shown as a chart
*** Scenario: Data shown as a chart
- *WHEN* the page spec holds a series fetched from an API
- *AND* the assistant adds a line chart bound to that series
- *THEN* a line chart of the series is drawn

### page-spec § A button sends a visitor message
*** Scenario: A button sends a visitor message
- *WHEN* the assistant has put a button labelled "Show tomorrow" on the page
- *AND* the visitor presses it
- *THEN* the assistant receives "Show tomorrow" as a visitor message and a turn starts

| capability | scenario | status | citations |
|-
| data-fetch | Fetch then display | cited | test/data-fetch.test.ts:22 |
| page-spec | Data shown as a chart | cited | test/data-fetch.test.ts:22 |
| page-spec | A button sends a visitor message | cited | test/page-spec.test.ts:85 |

3 scenarios: 3 cited

(Status "cited" means a test cites it; those tests are pending `it.fails` until promoted.)

## Verification (run in your worktree, in the foreground, once, before the commit)

`npx vitest run --reporter=junit --passWithNoTests` (junit report on stdout). Promote (drop `.fails` from) exactly the tests the task file's Verification section lists; every other `it.fails` stays pending and green. A pending test outside the list that starts passing is promoted too and named in `## Observations`. Baseline at HEAD: 23 tests, 0 failures. Never leave a test run in the background; report once.

## Rules (from the Implementor role)

- One commit on your branch, message `Implement task chart-and-actions: <description>`, ending with the lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01P9sjxVDXNx2YmGcBRhu2oh
  The commit holds code and test changes only, never the task file, the report or `## Observations`/`## Discoveries`.
- Premises: before writing code check the task's claims against the worktree (names, signatures, harness expectations). A wrong claim the task can absorb is corrected in the work and noted in `## Observations`. A wrong claim that changes what the task should do, or a test you did not write that fails and can only be fixed by changing behaviour a cited row/scenario states: stop and hand back `blocked chart-and-actions: premise wrong, <claim>`. If a test you did not write is wrong without changing the stated behaviour, change it, say so in `deviation_summary`, hand back with `deviated`, and add a `## Discoveries` entry (class: deviation) quoting the assertion before and after.
- Before the commit, re-read the prose beside each change (comments, docstrings, error texts, the cited sentences) and grep the tree for each name or message the task changed; fix any sentence the work made untrue.
- Shared machine: never `git stash` (commit instead); no `git worktree prune`/`gc`/`remove`; scratch files only in your scratch directory; no fixed ports/sockets (a server you start is named after your branch and on a free port you chose); start no GUI or interactive program; stop only processes you started.
- Never create task files. A defect outside the task goes in `## Discoveries` and `candidate_tasks` in the report. Do not expand scope silently (the task file's Out-of-scope list stands).
- `## Observations`: departures from the prescribed approach with evidence, weak tests, ambiguities resolved, speculative needs as one `thought:` line. Defects outside the task are NOT observations; they are `## Discoveries`.
- `## Discoveries` format (append to the task file), entries like: discovery_id: disc-chart-and-actions-1 / class: one of shape-fragmentation, vocabulary-mismatch, responsibility-leakage, dead-branch, interface-drift, mutation, invariant-gap, spec-signal, deviation, scope-question, duplication / description / affected_seam / kind: issue or question / severity / evidence / recommendation. Push-backs on seam rows go here too.
- If the task body itself needs revision before it can be implemented, stop and hand back `blocked chart-and-actions: <what you observed and what it blocks>`.

## Structured report (write to the report path above; for the orchestrator only)

```yaml
task_name: chart-and-actions
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

    done chart-and-actions <commit-sha>
    done chart-and-actions <commit-sha> deviated
    done chart-and-actions <commit-sha> candidates=<n>
    blocked chart-and-actions: <what you observed and what it blocks, one clause>
    failed chart-and-actions: <why, one clause>
