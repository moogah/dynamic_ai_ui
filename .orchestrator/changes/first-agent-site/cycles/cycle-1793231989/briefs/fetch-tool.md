# Brief: Implementor, task fetch-tool (change first-agent-site, cycle cycle-1793231989)

You are the Implementor for one task. Do exactly this task; do not add scope. Reference material below is to be pressure-tested, not deferred to: a seam row was written before any code existed, and if the code wants something else, implement what it needs and record a push-back in `## Discoveries`.

## Where things are

- Worktree (yours; already created, on branch `task-fetch-tool-20261029-002920`, based on the merge of the site-turn task, so `src/` and `server/app.ts` exist): `/home/user/dynamic_ai_ui/.worktrees/task-fetch-tool-20261029-002920`. Work and commit only here. Do not create worktrees; do not touch the main checkout `/home/user/dynamic_ai_ui` except the one file named below.
- Task file (read it in full first; it holds the summary, the cited seam rows verbatim, implementation steps, the pending tests to promote, out-of-scope): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/tasks/open/fetch-tool.md`. You append `## Observations` and `## Discoveries` to that file by this absolute path and NEVER commit it.
- Design (D1-D13, all seam rows): `docs/changes/first-agent-site/design.org` in your worktree (D3, D8, D10 matter most). Intent `docs/changes/first-agent-site/intent.org`; specs `docs/specs/data-fetch.org`, `agent-loop.org`, `page-spec.org`; vocabulary `docs/glossary.org` (use its terms; avoid the words it lists under Avoid). Do not modify anything under `docs/`.
- Tests already exist (pending ones are `it.fails`): `test/data-fetch.test.ts`, `test/agent-loop.test.ts`, `test/page-spec.test.ts`, harness `test/support/site.ts`, `load.ts`. Read `test/support/site.ts` first (its fake data hosts, the `dispatcher` routing, the `createApp({anthropicApiKey, allowlist, fetchModel, fetchData?})` signature). The existing code under `src/` and `server/app.ts` (the page, loop, `runTool`, `toolDefinitions` with `fetch_url` already named, the relay) was merged by the previous task; at HEAD `runTool` answers `fetch_url` with an error result saying it is not available yet. Scaffold in place; node_modules resolves from the parent directory.
- Report path (orchestrator only): `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reports/fetch-tool.md`
- Your scratch directory (all scratch files only here): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/fetch-tool/`

## Cited seams

The four rows are in the task file under "Cited seams": seam/allowlist, seam/fetch-result, seam/tool-list, seam/loop-state. Relevant decisions: D3, D4, D8, D10.

## Cited scenarios (text from docs/specs/) and coverage rows

### data-fetch § A host not on the list is refused
*** Scenario: A host not on the list is refused
- *WHEN* =example.org= is not on the allowlist
- *AND* the assistant asks to fetch =https://example.org/data=
- *THEN* the tool returns an error naming the allowed hosts
- *AND* no request is made

### data-fetch § A redirect off the list is not followed
*** Scenario: A redirect off the list is not followed
- *WHEN* an allowlisted host answers with a redirect to a host not on the list
- *THEN* the redirect is not followed and the tool returns an error

### data-fetch § A trimmed result says so
*** Scenario: A trimmed result says so
- *WHEN* a fetched response exceeds the size limit
- *THEN* the tool result holds the trimmed response
- *AND* states that it was trimmed and how much was left out
### agent-loop § The visitor sees progress
*** Scenario: The visitor sees progress
- *WHEN* a turn fetches data
- *THEN* the chat shows "calling the model", then "running tools" while the fetch runs
- *AND* returns to "awaiting the visitor" when the reply is complete

| capability | scenario | status | citations |
|-
| agent-loop | The visitor sees progress | cited | test/agent-loop.test.ts:46 |
| data-fetch | A host not on the list is refused | cited | test/data-fetch.test.ts:59 |
| data-fetch | A redirect off the list is not followed | cited | test/data-fetch.test.ts:76 |
| data-fetch | A trimmed result says so | cited | test/data-fetch.test.ts:172 |

4 scenarios: 4 cited

(Status "cited" means a test cites it; those tests are pending `it.fails` until you promote them.)

## Verification (run in your worktree, in the foreground, once, before the commit)

`npx vitest run --reporter=junit --passWithNoTests` (junit report on stdout). Promote (drop `.fails` from) exactly the tests the task file's Verification section lists; every other `it.fails` stays pending and green. The task file also asks you to strengthen the already-promoted test "refuses an allowlisted host whose address is not public, before any request reaches it" (a test edit; mention it in `deviation_summary`/Observations only if you change what it asserts beyond what the task says). A pending test outside the list that starts passing is promoted too and named in `## Observations`. Baseline at HEAD: 23 tests, 0 failures. Never leave a test run in the background; report once.

## Rules (from the Implementor role)

- One commit on your branch, message `Implement task fetch-tool: <description>`, ending with the lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01P9sjxVDXNx2YmGcBRhu2oh
  The commit holds code and test changes only, never the task file, the report or `## Observations`/`## Discoveries`.
- Premises: before writing code check the task's claims against the worktree (names, signatures, harness expectations). A wrong claim the task can absorb is corrected in the work and noted in `## Observations`. A wrong claim that changes what the task should do, or a test you did not write that fails and can only be fixed by changing behaviour a cited row/scenario states: stop and hand back `blocked fetch-tool: premise wrong, <claim>`. If a test you did not write is wrong without changing the stated behaviour, change it, say so in `deviation_summary`, hand back with `deviated`, and add a `## Discoveries` entry (class: deviation) quoting the assertion before and after.
- Before the commit, re-read the prose beside each change (comments, docstrings, error texts such as "fetch_url is not available", the cited sentences) and grep the tree for each name or message the task changed; fix any sentence the work made untrue.
- Shared machine: never `git stash` (commit instead); no `git worktree prune`/`gc`/`remove`; scratch files only in your scratch directory; no fixed ports/sockets; start no GUI or interactive program; stop only processes you started.
- Never create task files. A defect outside the task goes in `## Discoveries` and `candidate_tasks` in the report. Do not expand scope silently (Out-of-scope list in the task file stands).
- `## Observations`: departures from the prescribed approach with evidence, weak tests, ambiguities resolved, speculative needs as one `thought:` line. Defects outside the task are NOT observations; they are `## Discoveries`.
- `## Discoveries` format (append to the task file), entries like: discovery_id: disc-fetch-tool-1 / class: one of shape-fragmentation, vocabulary-mismatch, responsibility-leakage, dead-branch, interface-drift, mutation, invariant-gap, spec-signal, deviation, scope-question, duplication / description / affected_seam / kind: issue or question / severity / evidence / recommendation. Push-backs on seam rows go here too.
- If the task body itself needs revision before it can be implemented, stop and hand back `blocked fetch-tool: <what you observed and what it blocks>`.

## Structured report (write to the report path above; for the orchestrator only)

```yaml
task_name: fetch-tool
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

    done fetch-tool <commit-sha>
    done fetch-tool <commit-sha> deviated
    done fetch-tool <commit-sha> candidates=<n>
    blocked fetch-tool: <what you observed and what it blocks, one clause>
    failed fetch-tool: <why, one clause>
