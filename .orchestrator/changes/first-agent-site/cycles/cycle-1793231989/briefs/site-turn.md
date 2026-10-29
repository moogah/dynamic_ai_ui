# Brief: Implementor, task site-turn (change first-agent-site, cycle cycle-1793231989)

You are the Implementor for one task. Do exactly this task; do not add scope. Reference material below is to be pressure-tested, not deferred to: a seam row was written before any code existed, and if the code wants something else, implement what it needs and record a push-back in `## Discoveries`.

## Where things are

- Worktree (yours; already created, on branch `task-site-turn-20261029-001647`): `/home/user/dynamic_ai_ui/.worktrees/task-site-turn-20261029-001647`. Work and commit only here. Do not create worktrees, do not touch the main checkout `/home/user/dynamic_ai_ui` except the two files named below.
- Task file (read it in full first; it holds the summary, the cited seam rows verbatim, implementation steps, the pending tests to promote, out-of-scope): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/tasks/open/site-turn.md`. You append `## Observations` and `## Discoveries` to that file by this absolute path and NEVER commit it.
- Design (decisions D1-D13 and all seam rows): `/home/user/dynamic_ai_ui/docs/changes/first-agent-site/design.org` (read from the worktree's own copy, `docs/changes/first-agent-site/design.org`). Intent: `docs/changes/first-agent-site/intent.org`. Specs: `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`. Vocabulary: `docs/glossary.org` (use its terms: page spec, component catalog, skeleton, turn, allowlist; avoid the words it lists under Avoid). Do not modify anything under `docs/`.
- Tests already exist (pending ones are `it.fails`): `test/page-spec.test.ts`, `test/agent-loop.test.ts`, `test/data-fetch.test.ts`, harness `test/support/site.ts` and `test/support/load.ts`. Read `test/support/site.ts` and `load.ts` first: they fix the roles, names, marks and `createApp` signature. There is no `src/` or `server/` yet; you create them. Scaffold (package.json, .npmrc, vite.config.ts, tsconfig.json) exists; node_modules resolves from the parent directory.
- Report path (orchestrator only): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reports/site-turn.md`
- Your scratch directory (all scratch files only here, never elsewhere): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/site-turn/`

## Cited seams (verbatim from design.org § Seams; pressure-test them)

The nine rows are in the task file under "Cited seams": seam/page-store, seam/catalog, seam/page-tools, seam/renderer, seam/page-snapshot, seam/tool-list, seam/turn, seam/loop-state, seam/model-relay. Also relevant decisions: D1, D2, D3, D4, D7, D9, D11, D12 (read them in design.org).

## Cited scenarios (text from docs/specs/ at HEAD) and their coverage rows

### page-spec § The skeleton on first load
*** Scenario: The skeleton on first load
- *WHEN* a visitor opens the site
- *THEN* they see the skeleton drawn: a header area and an empty content area
- *AND* the chat beside it

### page-spec § An edit appears without a reload
*** Scenario: An edit appears without a reload
- *WHEN* the assistant adds a card to the page spec during a turn
- *THEN* the card appears on the page without a reload
- *AND* the rest of the page is unchanged

### page-spec § An unknown type is rejected
*** Scenario: An unknown type is rejected
- *WHEN* the assistant adds a component of type =map= and =map= is not in the catalog
- *THEN* the tool call fails with an error naming the allowed types
- *AND* the page is unchanged

### page-spec § A reload returns the skeleton
*** Scenario: A reload returns the skeleton
- *WHEN* a visitor who has shaped the page reloads it
- *THEN* they see the skeleton again

### agent-loop § A turn with a tool call
*** Scenario: A turn with a tool call
- *WHEN* the visitor asks "add a heading that says Hello"
- *THEN* the model calls a page-spec tool and the heading appears
- *AND* the tool result goes back to the model and its reply appears in the chat

### agent-loop § No key in the browser
*** Scenario: No key in the browser
- *WHEN* a visitor inspects the page and its network traffic
- *THEN* no Claude API key appears

| capability | scenario | status | citations |
|-
| agent-loop | A turn with a tool call | cited | test/agent-loop.test.ts:28 |
| agent-loop | No key in the browser | cited | test/agent-loop.test.ts:133 |
| page-spec | The skeleton on first load | cited | test/page-spec.test.ts:15 |
| page-spec | An edit appears without a reload | cited | test/page-spec.test.ts:26 |
| page-spec | An unknown type is rejected | cited | test/page-spec.test.ts:47 |
| page-spec | A reload returns the skeleton | cited | test/page-spec.test.ts:104 |

6 scenarios: 6 cited

(Status "cited" means a test cites it; the tests are pending `it.fails` until you promote them.)

## Verification (run in your worktree, in the foreground, once, before the commit)

`npx vitest run --reporter=junit --passWithNoTests` (the junit report prints to stdout; take the summary and any failures from it). Promote (drop `.fails`) exactly the tests the task file's Verification section lists, in the implementation commit; every other `it.fails` stays pending and green. A pending test outside the list that starts passing is promoted too and named in `## Observations`. Baseline at HEAD: 23 tests, 0 failures. Never leave a test run in the background; report once.

## Rules (from the Implementor role)

- One commit on your branch, message `Implement task site-turn: <description>`, ending with the lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01P9sjxVDXNx2YmGcBRhu2oh
  The commit holds code and test promotions only, never the task file, the report or `## Observations`/`## Discoveries`.
- Premises: before writing code check the task's claims against the worktree (names, signatures, harness expectations). A wrong claim the task can absorb is corrected in the work and noted in `## Observations`. A wrong claim that changes what the task should do, or a test you did not write that fails and can only be fixed by changing behaviour a cited row/scenario states: stop and hand back `blocked site-turn: premise wrong, <claim>`. If a test you did not write is wrong without changing the stated behaviour, change it, say so in `deviation_summary`, hand back with `deviated`, and add a `## Discoveries` entry (class: deviation) quoting the assertion before and after.
- Before the commit, re-read the prose beside each change (comments, docs-in-code, the cited sentences) and grep the tree for each name the task changed; fix any sentence the work made untrue.
- Shared machine: never `git stash` (commit instead); no `git worktree prune`/`gc`/`remove`; scratch files only in your scratch directory; name any server or port after your branch and never free a port that is not yours; start no GUI or interactive program; stop only processes you started.
- Never create task files. A defect outside the task goes in `## Discoveries` and `candidate_tasks` in the report. Do not expand scope silently (Out-of-scope list in the task file stands: stop/undo behaviour, fetch tool server side and allowlist, chart/form/button drawing and images through the server, Node entry/Vite build, streaming).
- `## Observations`: departures from the prescribed approach with evidence, weak tests, ambiguities resolved, speculative needs as one `thought:` line. Defects outside the task are NOT observations; they are `## Discoveries`.
- `## Discoveries` format (append to the task file): entries like
  - discovery_id: disc-site-turn-1 / class: one of shape-fragmentation, vocabulary-mismatch, responsibility-leakage, dead-branch, interface-drift, mutation, invariant-gap, spec-signal, deviation, scope-question, duplication / description / affected_seam / kind: issue or question / severity / evidence / recommendation.
  Push-backs on seam rows go here too. Do not modify `docs/`.
- If the task body itself needs revision before it can be implemented, stop and hand back `blocked site-turn: <what you observed and what it blocks>`.

## Structured report (write to the report path above; for the orchestrator only)

```yaml
task_name: site-turn
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

    done site-turn <commit-sha>
    done site-turn <commit-sha> deviated
    done site-turn <commit-sha> candidates=<n>
    blocked site-turn: <what you observed and what it blocks, one clause>
    failed site-turn: <why, one clause>

(`deviated` when deviation_summary is non-empty; `candidates=<n>` when candidate_tasks is non-empty.)
