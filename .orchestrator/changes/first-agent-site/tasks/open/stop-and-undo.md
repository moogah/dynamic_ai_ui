---
task_name: stop-and-undo
description: "Stopping a turn and the one-step undo, with the model told the page as undo left it"
change: first-agent-site
status: needs_review
merge_commit: 27d7b87c75c9e47990e4b50691574dfb4df16993
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

## Observations

- `AgentLoop.stop` finishes the stop synchronously (aborts the turn's controller, answers the running reply's unanswered tool calls, goes to awaiting the visitor) instead of waiting for the aborted request to reject; the turn's coroutine checks `signal.aborted` after every await and returns without touching state, the conversation or the page store. So a late reply is dropped even from a `callModel`/`fetchUrl` that ignores the signal. Evidence: src/agent/loop.ts `stop()`, the `if (signal.aborted) return` lines in `send`.
- Unanswered tool calls get an error tool_result with `STOPPED_RESULT` (src/agent/tools.ts), and `runTool` itself returns that result rather than applying a fetch outcome that arrives after the stop.
- Ambiguity resolved: a turn stopped while the model was answering leaves the conversation ending on a user message (the visitor's words or the last tool results). The next visitor message's blocks are appended to that user message, so roles keep alternating; no message is rewritten or removed (D4). Not stated in seam/stop.
- Undo is `disabled` while a turn runs and Stop is `disabled` between turns (src/App.tsx). The chat gets a "Stopped by the visitor." line and one "<tool>: stopped" line per call stopped.
- Weak test: the harness's `abortable` rejects the held model reply on abort, so the "late reply arrives and is dropped" path through the post-await `signal.aborted` check is only exercised for the reject path, not for a reply that resolves after abort.
- thought: Undo stays enabled between turns even when there is nothing to undo (`PageStore.undo` returns false); a `canUndo` on the store would let the button say so.
- No pending test outside the Verification list started passing; the 2 remaining `it.fails` stay pending and green.

## Discoveries

- discovery_id: disc-stop-and-undo-1
  class: invariant-gap
  description: Stopping aborts the browser's request to /api/messages, but the server's relay does not pass the incoming request's signal to its upstream Messages API call (server/app.ts:82 `fetchModel(MESSAGES_API, {...})` has no `signal`), so a stopped model request keeps running and billing at the Messages API until it completes. D6 allows a running tool on the server to complete; it says the model request is aborted.
  affected_seam: seam/stop, seam/model-relay
  kind: question
  severity: low
  evidence: grep -n signal server/app.ts returns nothing; fetchTool.ts likewise has no signal for the data host fetch (that one D6 explicitly allows).
  recommendation: pass `request.signal` to `fetchModel` in the relay, or record in D6 that the upstream model request, like a tool run, completes on the server and is dropped.
