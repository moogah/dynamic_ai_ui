# Brief: Reviewer, task stop-and-undo (change first-agent-site, cycle cycle-1793231989)

This diff is up for review on task stop-and-undo. Read your role description first: `/root/.claude/skills/orchestrate/roles/reviewer.md` (mindset, three directions, probes, output contract). You are author-blind: review only the sources listed here. Do not look for or read any report, `## Observations` or `## Discoveries` section, or anything written by whoever did the work; do not read the task file under `.orchestrator/` in the main checkout (the task brief is embedded below).

## Where things are

- Your checkout (clean, detached at the merge commit `27d7b87c75c9e47990e4b50691574dfb4df16993`): `/home/user/dynamic_ai_ui/.worktrees/review-stop-and-undo-20261029`. Do not modify it; run the test command and probes read-only. The merge commit's first parent (`27d7b87c75c9e47990e4b50691574dfb4df16993^1`) is the base.
- The diff to review: `git -C /home/user/dynamic_ai_ui/.worktrees/review-stop-and-undo-20261029 diff 27d7b87c75c9e47990e4b50691574dfb4df16993^1..27d7b87c75c9e47990e4b50691574dfb4df16993`
- Test command (run in your checkout, foreground, once): `npx vitest run --reporter=junit --passWithNoTests` (junit report to stdout; 23 tests, 0 failures expected). Node modules resolve from the parent directory.
- Design: `docs/changes/first-agent-site/design.org` in your checkout (decisions D1-D13 and the Seams table); specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; glossary `docs/glossary.org`; intent `docs/changes/first-agent-site/intent.org`.
- Your scratch directory (probes only, nothing in the repository; delete it when done): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/review-stop-and-undo/`
- Findings file you write: `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reviews/stop-and-undo.md` (format in the role file's Output contract; frontmatter `task_name: stop-and-undo`, `merge_commit: 27d7b87c75c9e47990e4b50691574dfb4df16993`).
- Tests under `test/` and the harness `test/support/site.ts` are the design round's; the diff promoted pending `it.fails` tests by dropping `.fails` (check each promoted test genuinely exercises the behaviour its scenario states, and that no other pending test was touched).
- Project standards: none beyond the role file. Project priors: none.
- Shared machine rules: no `git stash`, no `git worktree prune`/`gc`/`remove`, no GUI or interactive program, no fixed ports, stop only processes you started, no test run left in the background.

## Task brief (the task file, without its Observations and Discoveries sections)

---
task_name: stop-and-undo
description: "Stopping a turn and the one-step undo, with the model told the page as undo left it"
change: first-agent-site
status: (merged)
task_class: feature
on_critical_path: true

cites_seams:
  - seam/stop
  - seam/page-store
  - seam/page-snapshot
cites_scenarios:
  - agent-loop § Stopping keeps edits already made
  - page-spec § Undo restores the page before the last turn

relations:
  blocked_by:
    - site-turn: { status: merged }
    - fetch-tool: { status: merged }
---

# stop-and-undo

## Summary

Make the Stop and Undo controls work (D5, D6): stopping aborts the turn's model request or tool run, applies nothing that arrives afterwards, keeps the page spec, and leaves every tool call answered (the second stop test stops a running fetch, hence after fetch-tool); undo puts back the copy taken when the last turn started, one step only, offered between turns. The next visitor message tells the model the page as undo left it.

## Cited seams

| seam/stop | Stopping a turn aborts its model request or tool run, applies nothing that arrives for it afterwards, keeps the page spec as it stands, and leaves every tool call of the conversation answered, so undo and the next turn work as after a finished turn. | =src/agent/loop.ts=: =AgentLoop.stop= | agent-loop § Stopping keeps edits already made | =test/agent-loop.test.ts= |

Check that an aborted request's late reply is dropped, and that a tool call interrupted mid-run gets a tool result in the conversation (an error result saying it was stopped is one way). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/page-store | Each page has one holder of its page spec, made with the page and gone with it: it starts as the skeleton, every edit is applied through it, it keeps the copy taken when a turn starts, and undo puts that copy back; nothing of it is written to browser storage. | =src/page/store.ts=: =createPageStore=, =PageStore.apply=, =PageStore.beginTurn=, =PageStore.undo=; =src/App.tsx=: =App= | page-spec § The skeleton on first load; page-spec § A reload returns the skeleton; page-spec § Undo restores the page before the last turn; agent-loop § Stopping keeps edits already made | =test/page-spec.test.ts=; =test/agent-loop.test.ts= |

Undo is one step: a second undo before another turn changes nothing; undo is not offered while a turn runs. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/page-snapshot | Each visitor message the model receives carries the page as it stands, described in one place: every component with its id, type and props, and the data by name and shape, never in full. | =src/page/snapshot.ts=: =describePage=; =src/agent/loop.ts=: =AgentLoop.send= | page-spec § Undo restores the page before the last turn | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

After undo, the next visitor message's page description is the restored page; the conversation itself is not rewritten (D4). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

## Implementation steps

1. `AgentLoop.stop` in `src/agent/loop.ts` with an AbortController per turn passed to the relay fetch and the tool run.
2. Answer unanswered tool calls of a stopped turn before the next turn's request.
3. Wire the Undo control to `PageStore.undo`; disable it while a turn runs.

## Verification

Run `npx vitest run --reporter=junit --passWithNoTests` and report the last 10 lines. Promote these pending tests by dropping `.fails` in the implementation commit; every other `it.fails` stays pending and green. A pending test outside this list that starts passing is promoted too and named in `## Observations`:

- test/agent-loop.test.ts: "stops the loop, keeps the card it added, and undo removes it (Scenario: agent-loop § Stopping keeps edits already made)"
- test/agent-loop.test.ts: "leaves every tool call of a stopped turn answered for the next turn"
- test/page-spec.test.ts: "puts back the table the last turn removed (Scenario: page-spec § Undo restores the page before the last turn)"
- test/page-spec.test.ts: "tells the model, with the next visitor message, the page as undo left it"

## Out-of-scope

- Multi-step undo or history (intent non-goal).
- Recalling a tool call already running on the server (D6: its result is dropped).


## Cited scenarios (text from docs/specs/ at the merge commit) and coverage rows

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

## Hand-back

Your last act is one line, at most 200 characters, nothing else, no paths: `reviewed stop-and-undo issues=<n> questions=<n> spec-signal=<n> thoughts=<n>`.
