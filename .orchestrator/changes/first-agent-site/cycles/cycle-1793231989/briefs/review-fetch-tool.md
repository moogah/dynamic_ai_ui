# Brief: Reviewer, task fetch-tool (change first-agent-site, cycle cycle-1793231989)

This diff is up for review on task fetch-tool. Read your role description first: `/root/.claude/skills/orchestrate/roles/reviewer.md` (mindset, three directions, probes, output contract). You are author-blind: review only the sources listed here. Do not look for or read any report, `## Observations` or `## Discoveries` section, or anything written by whoever did the work; do not read the task file under `.orchestrator/` in the main checkout (the task brief is embedded below).

## Where things are

- Your checkout (clean, detached at the merge commit `18cdfe1a59e72da471c19ab6391a04f763fb5fc1`): `/home/user/dynamic_ai_ui/.worktrees/review-fetch-tool-20261029-003429`. Do not modify it; run the test command and probes read-only. The merge commit's first parent (`18cdfe1a59e72da471c19ab6391a04f763fb5fc1^1`) is the base.
- The diff to review: `git -C /home/user/dynamic_ai_ui/.worktrees/review-fetch-tool-20261029-003429 diff 18cdfe1a59e72da471c19ab6391a04f763fb5fc1^1..18cdfe1a59e72da471c19ab6391a04f763fb5fc1`
- Test command (run in your checkout, foreground, once): `npx vitest run --reporter=junit --passWithNoTests` (junit report to stdout; 23 tests, 0 failures expected). Node modules resolve from the parent directory.
- Design: `docs/changes/first-agent-site/design.org` in your checkout (decisions D1-D13 and the Seams table); specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; glossary `docs/glossary.org`; intent `docs/changes/first-agent-site/intent.org`.
- Your scratch directory (probes only, nothing in the repository; delete it when done): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/review-fetch-tool/`
- Findings file you write: `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reviews/fetch-tool.md` (format in the role file's Output contract; frontmatter `task_name: fetch-tool`, `merge_commit: 18cdfe1a59e72da471c19ab6391a04f763fb5fc1`).
- Tests under `test/` and the harness `test/support/site.ts` are the design round's; the diff promoted pending `it.fails` tests by dropping `.fails` (check each promoted test genuinely exercises the behaviour its scenario states, and that no other pending test was touched).
- Project standards: none beyond the role file. Project priors: none.
- Shared machine rules: no `git stash`, no `git worktree prune`/`gc`/`remove`, no GUI or interactive program, no fixed ports, stop only processes you started, no test run left in the background.

## Task brief (the task file, without its Observations and Discoveries sections)

---
task_name: fetch-tool
description: "The allowlisted fetch tool on the owner's server: allowlist checks, connection-time address check, secrets, trimming, and the data kept in the page spec"
change: first-agent-site
status: (merged)
task_class: feature
on_critical_path: true

cites_seams:
  - seam/allowlist
  - seam/fetch-result
  - seam/tool-list
  - seam/loop-state
cites_scenarios:
  - data-fetch § A host not on the list is refused
  - data-fetch § A redirect off the list is not followed
  - data-fetch § A trimmed result says so
  - agent-loop § The visitor sees progress

relations:
  blocked_by:
    - site-turn: { status: merged }
---

# fetch-tool

## Summary

Implement `fetch_url` end to end (D3, D8): the browser's `runTool` posts to the server, `server/fetchTool.ts` `fetchForTool` checks the host on the parsed URL against the allowlist, follows redirects by hand re-checking each, uses `fetchData` when given and otherwise its own transport that refuses non-public addresses at connection time, adds a keyed host's secret as its header, and returns the whole response for the page spec's data under the given name plus a view for the model cut to a size limit with a trimmed note.

## Cited seams

| seam/allowlist | The server requests only from allowlisted hosts, checked on the parsed URL before any request and again on every redirect, and its own transport refuses at connection time a host whose address is not public; a host's secret goes only on requests to that host and is absent from everything the server returns; the page loads nothing from another host. | =server/fetchTool.ts=: =fetchForTool=; =server/app.ts=: =createApp= | data-fetch § A host not on the list is refused; data-fetch § A redirect off the list is not followed | =test/data-fetch.test.ts= |

Secrets must appear nowhere in what the server returns, even when the host echoes them. The default transport's address check is at connection time (e.g. an undici dispatcher with a lookup that rejects private, loopback and link-local addresses): the harness routes requests naming a `dispatcher` to the real fetch. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/fetch-result | The fetch tool has one result: the whole response, for the browser to keep in the page spec's data under the name the assistant gave, and the view the model reads, cut to a size limit and saying, when cut, that it was trimmed and how much was left out. | =server/fetchTool.ts=: =fetchForTool=; =src/agent/tools.ts=: =runTool= | data-fetch § Fetch then display; data-fetch § A trimmed result says so; page-spec § Data shown as a chart | =test/data-fetch.test.ts= |

The model's view says it was trimmed and how much was left out (a number). The whole response must reach the browser and stay out of every later model request (the page snapshot names data by shape). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/tool-list | One module defines the tools the model is offered, the page-spec tools and the fetch tool, with their names, descriptions and input schemas; the server sends exactly that list, and the browser runs each call and builds each tool result in one place. | =src/agent/tools.ts=: =toolDefinitions=, =runTool=; =server/app.ts=: =createApp= | agent-loop § A turn with a tool call; data-fetch § Fetch then display | =test/agent-loop.test.ts=; =test/data-fetch.test.ts= |

`fetch_url` is already in the list from site-turn; this task makes `runTool` run it. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/loop-state | The loop is the only writer of its state, always one of idle, calling the model, running tools, awaiting the visitor and error, and the page shows the current state's label from one mapping. | =src/agent/loop.ts=: =AgentLoop.state=, =AgentLoop.subscribe=; =src/agent/states.ts=: =LoopState=, =stateLabel= | agent-loop § The visitor sees progress | =test/agent-loop.test.ts= |

'running tools' shows for the whole fetch. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

## Implementation steps

1. `server/fetchTool.ts`: `fetchForTool(input, {allowlist, fetchData})` with the checks above; errors as tool errors naming the allowed hosts.
2. Route it in `createApp` (a path on the page's own origin).
3. `src/agent/tools.ts` `runTool` for `fetch_url`: keep the whole response via `set_data`-equivalent store edit, return the trimmed view as the tool result.

## Verification

Run `npx vitest run --reporter=junit --passWithNoTests` and report the last 10 lines. Promote these pending tests by dropping `.fails` in the implementation commit; every other `it.fails` stays pending and green. A pending test outside this list that starts passing is promoted too and named in `## Observations`:

- test/data-fetch.test.ts: "refuses a host off the list with an error naming the allowed hosts, and makes no request (Scenario: data-fetch § A host not on the list is refused)"
- test/data-fetch.test.ts: "does not follow a redirect from an allowlisted host to one off the list (Scenario: data-fetch § A redirect off the list is not followed)"
- test/data-fetch.test.ts: "refuses an allowlisted host whose address is not public, before any request reaches it" (already promoted by site-turn, where it passes only because `fetch_url` answers "not available": strengthen it in this commit so it asserts the error names the refused host or address, and so it fails if the connection-time check is absent)
- test/data-fetch.test.ts: "adds the host's secret to the request and keeps it from the model and the page"
- test/data-fetch.test.ts: "gives the model a trimmed response that says it was trimmed and how much was left out (Scenario: data-fetch § A trimmed result says so)"
- test/data-fetch.test.ts: "never sends the model the whole response, in the tool result or with the next message"
- test/agent-loop.test.ts: "shows calling the model, then running tools while the fetch runs, then awaiting the visitor (Scenario: agent-loop § The visitor sees progress)"

## Out-of-scope

- Drawing a chart of fetched data, and images through the server (chart-and-actions).
- The allowlist file and environment variables (owner-server-entry).
- A secret sent in the query string: only the header form is needed for the tests; D10 says the keyed service chosen in owner-server-entry may add it.


## Cited scenarios (text from docs/specs/ at the merge commit) and coverage rows

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
| data-fetch | A trimmed result says so | cited | test/data-fetch.test.ts:175 |

4 scenarios: 4 cited

## Hand-back

Your last act is one line, at most 200 characters, nothing else, no paths: `reviewed fetch-tool issues=<n> questions=<n> spec-signal=<n> thoughts=<n>`.
