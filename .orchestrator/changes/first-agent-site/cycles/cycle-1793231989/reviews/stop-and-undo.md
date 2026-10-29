---
task_name: stop-and-undo
merge_commit: 27d7b87c75c9e47990e4b50691574dfb4df16993
reviewed_at: 2026-10-29T00:45:00Z
finding_count: 2
clean_review: false
---

## Summary

Reviewed the diff (src/App.tsx, src/agent/loop.ts, src/agent/tools.ts and the four promoted tests) against seam/stop, seam/page-store, seam/page-snapshot, D4-D6 and the two cited scenarios, ran the test command (23 tests, 0 failures; the two remaining `it.fails` tests, page-spec "A button sends a visitor message" and data-fetch "Fetch then display", are untouched and still pending), and ran probes of `createAgentLoop` and `createPageStore` from a scratch directory. The probes covered a stop during a fetch with a later call in the same reply, a stop during the second model request with a late reply that ignores the signal and a new turn already started, and a stop or undo between turns. They confirm what the seam asks for: edits stay, late replies and late fetch results are dropped, every tool call is answered, the next request alternates roles, and undo is one step and disabled while a turn runs. I found two defects. First, a turn stopped while the model was answering leaves the visitor's stopped request in the conversation, unanswered and unmarked, so the next turn sends it to the model again as a live request. Second, the server's relay does not pass on the abort, so the Messages API call it made keeps running and is billed after the visitor presses Stop.

## Findings

### Finding 1: A turn stopped during a model request is sent again as a live request with the next visitor message

- kind: issue
- severity: medium
- direction: design-drift
- locations:
  - file: src/agent/loop.ts:89
  - file: src/agent/loop.ts:140
- evidence: |
  When the stop comes during a model request, `stop()` writes nothing to the conversation. Only the running-tools branch adds results, and those say "stopped by the visitor". `addVisitorMessage` then appends the next visitor message to the trailing user message. Probe P4: send "remove every component from the page", stop during the first request, then send "add a heading that says Hi". The next request holds one user message with the blocks ["remove every component from the page", <page>, "add a heading that says Hi", <page>] and nothing saying the first was stopped. The chat shows "Stopped by the visitor." but the model never learns it, so it may well carry out the cancelled request. A stop during a later model request of the turn behaves the same way (probe P2: `user:tool_result,text,text`). The model sees its own unfinished turn with no sign that it ended, so it may resume it. This goes against seam/stop's "so undo and the next turn work as after a finished turn" and the glossary's "turn ... the unit ... stopping cancels". Inside one diff it is also inconsistent: a stop during a tool run tells the model about the stop, a stop during a model request does not. No test covers what the model receives after a stop during a model request.
- recommended_action:
  kind: inline-fix
  detail: When stop() aborts a turn outside a tool run, record the stop for the next request, for example a text block "The visitor stopped the previous turn before you answered" added ahead of the next visitor words (this only appends, so D4 holds), and add a test that checks the next request carries it.

### Finding 2: Stop does not abort the server's upstream Messages API request

- kind: issue
- severity: low
- direction: design-drift
- locations:
  - file: server/app.ts:81
- evidence: |
  The browser now aborts its own fetch to /api/messages (loop.ts:56), but `relay` calls `fetchModel(MESSAGES_API, {...})` without `signal: request.signal` and then awaits `upstream.text()`. When the visitor stops a turn, the owner's server keeps the model request running until it completes, which can be up to MAX_TOKENS = 16000 output tokens billed to the owner's key, and then throws the reply away. D6 and seam/stop say that stopping "aborts its model request". Only the fetch tool's server-side run is exempted ("a tool already running ... may still complete on the server"), not the model request. To settle it: create the handler with a `fetchModel` that records `init.signal`, send a Request whose signal you then abort, and check whether the upstream signal aborts. Reading the code says it does not, since no signal is passed.
- recommended_action:
  kind: follow-up-task
  detail: Pass `signal: request.signal` to the upstream `fetchModel` call in server/app.ts relay (and likewise to the fetch tool's data fetch if D6 is meant to allow it), with a test that an aborted page request aborts the upstream one.

## Thoughts

- thought: The late-reply guard at loop.ts:111 is not exercised by the promoted tests, because the harness's `abortable` rejects the held reply on abort, so `late.release` never reaches the loop. Deleting the guard would still pass. Probe P2, with a callModel that ignores the signal, shows the guard works.
- thought: Undo stays enabled between turns when nothing can be undone: before the first turn, and after an undo has already been used. D5 only requires it to be disabled while a turn runs, but a visitor gets no signal that pressing it does nothing.
- thought: `addVisitorMessage` changes the content of the trailing user message object in place. That is safe today because `callModelThroughServer` serialises at once, but a `CallModel` that keeps the array without copying it would see the change.

## What I looked for and ruled out

Sub-par code: I looked for races between `stop()` and the loop at each await point. The only awaits are `callModel` and `runTool`, and page tools apply synchronously, so a stop cannot land between an edit and its result. Ruled out: a stop while a page tool is applying, a double stop, a stop between turns (no-op, state unchanged), the stale turn's `finally` clearing a newer turn (guarded by `turn === current`), and a late fetch result or later calls in the same reply being applied after a stop (probe P1b: c1 kept, the later c2 and the fetched data not applied). Error results carry `is_error: true` and every tool_use id is answered once (probe P1).

Design drift: Undo goes through `PageStore.undo` only, is disabled while busy, and restores the copy from `beginTurn`. A stopped turn's copy is still what undo restores (D6). The page description is built in one place and goes with every visitor message (D4), and the conversation is never rewritten before an assistant message. Ruled out: the diff edits no `docs/` file, the promoted tests carry no pending marker, and no other pending test was touched.

Tests: each promoted test fails without the behaviour it names. Undo did nothing before the diff, so the table and card tests and the "t1 in the newest message" check depend on it, and the tool-answered test walks every assistant tool_use in the second request. `model.newest` only looks past the last assistant message, so "t1" there must come from the new page description, not from the history.
