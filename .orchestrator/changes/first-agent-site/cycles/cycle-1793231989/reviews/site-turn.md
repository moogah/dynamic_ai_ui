---
task_name: site-turn
merge_commit: 9bf914834cc35822515c8f77afe559e1fc36b2a7
reviewed_at: 2026-10-29T00:33:33Z
finding_count: 6
clean_review: false
---

## Summary

I read the whole diff (server/app.ts, src/App.tsx, src/agent/*, src/page/*, src/render/*, and the three test files whose only change is dropping `.fails`) against the task brief, the nine cited seam rows, D1-D13, the cited scenarios and the glossary. I ran the test command once (23 tests, 0 failures), ran `tsc` over the project (clean), and probed the page-spec tools, the renderer and the loop directly from a scratch vitest config. The walking skeleton holds its seams: the key stays on the server, the server fixes model, system prompt and tool list from the one `toolDefinitions` module, nothing touches browser storage, `src/page/` imports nothing from `src/render/`, every drawn component carries its id and type marks inside `main`, unchanged components keep their DOM element across an edit, edits are all or nothing, and all tool calls of a reply are answered in one user message with failures as `is_error`. What I found: one loop defect that breaks the rest of a visit after an empty model reply; three page-spec-tool defects that come from keying components on a plain object (prototype-named ids, integer-like ids reordering siblings) or from not checking children when a container changes type; one promoted test that is green without the behaviour it names; and a server handler that rejects instead of answering when the Messages API is unreachable.

## Findings

### Finding 1: An empty model reply is kept as an empty assistant message, and every later turn of the visit is then an invalid request

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: src/agent/loop.ts:92
  - file: src/agent/loop.ts:93
- evidence: |
  `send` pushes `{ role: "assistant", content }` whatever `content` holds, including `[]` (an end_turn reply with no blocks, which the model does sometimes return after tool results, or a malformed reply, which line 92 also maps to `[]`). The Messages API rejects a request in which any message other than a final assistant message has empty content ("all messages must have non-empty content except for the optional final assistant message"), and the conversation is append-only, so from then on every turn the visitor starts fails with a 400 and the page goes to error, for the rest of the visit. Probe (scratch vitest, `createAgentLoop` with a scripted `callModel` answering `{content: []}` then a text reply): after the first send the state is `awaiting_visitor` with no assistant entry in the chat; the second send's request has roles/content lengths `[["user",2],["assistant",0],["user",2]]`. The visitor also sees the turn end with no reply at all.
- recommended_action:
  kind: inline-fix
  detail: Do not push an assistant message with empty content (skip it, or treat an empty or non-array reply as an error state) so the conversation stays a valid request; add a test with an empty reply followed by a second turn.

### Finding 2: Component ids that name Object.prototype members give false successes or an unhelpful thrown error

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/page/tools.ts:97
  - file: src/page/tools.ts:109
  - file: src/page/tools.ts:113
  - file: src/page/tools.ts:142
  - file: src/page/bindings.ts:39
- evidence: |
  The component map is a plain object read and written by bracket access with ids the model chooses. Probes against `runPageTool` at the merge commit: `put_components` with id `__proto__` answers `ok: true, "Put __proto__ (text)."` but the setter replaces the map's prototype, so the spec's own keys stay `[header, content]` and nothing is drawn (a wrong success the model then reports to the visitor; worse, later lookups like `next["type"]` resolve through that prototype until the next spread drops it). `remove_component {id: "constructor"}` on the skeleton answers `ok: true, "Removed constructor."` because `spec.components["constructor"]` is `Object`. `put_components` with `parent: "toString"` throws `Cannot read properties of undefined (reading 'container')` at line 115, which `runTool` turns into the error "put_components failed: ..." rather than "no component 'toString' to put it in". The same pattern in `lookup` lets a binding such as `/x/constructor` resolve to a function, which `asText` then turns into `undefined` despite its `string` return type. Unlikely ids, but each is a tool result that says the wrong thing.
- recommended_action:
  kind: inline-fix
  detail: Look components up with `Object.hasOwn` (or keep them in a `Map` / a null-prototype object) in tools.ts and bindings.ts, and reject `__proto__` as an id.

### Finding 3: Integer-like component ids reorder siblings, contrary to "insertion order is sibling order"

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/page/spec.ts:36
  - file: src/page/spec.ts:69
  - file: src/page/tools.ts:109
- evidence: |
  `PageSpec.components` documents "Insertion order is sibling order", and `childrenOf` relies on `Object.values` order. JavaScript orders integer-like keys ascending before all string keys, whatever the insertion order. Probe: putting text components with ids `intro`, `10`, `2` into `content`, one call each, gives `childrenOf(spec, "content")` = `['2', '10', 'intro']`. A model that numbers its components (`"1"`, `"2"`, ...; the system prompt asks only for "short, stable ids") gets a page drawn in an order it did not ask for, and the snapshot it reads back lists the same wrong order.
- recommended_action:
  kind: inline-fix
  detail: Keep sibling order explicitly (an ordered array of ids or a `Map`) rather than relying on object key order, or reject integer-like ids with a tool error.

### Finding 4: Changing a container into a non-container type leaves its children in the page spec but undrawn

- kind: issue
- severity: low
- direction: design-drift
- locations:
  - file: src/page/tools.ts:113
  - file: src/render/PageView.tsx:26
- evidence: |
  `putComponents` checks only that each component being put has a container parent; it does not check that a component replaced by a non-container type has no children. Probe: put card `c1` with text child `t1`, then put `c1` again as a heading: the tool answers `ok: true, "Put c1 (heading)."`, the snapshot sent to the model still lists `t1:c1`, and the drawn markup holds only `<h2 data-component-id="c1">now a heading</h2>` (the heading drawing ignores `children`). page-spec § The page is drawn from the page spec says the page SHALL show exactly what the page spec describes, and seam/renderer says one drawn element per component; here the model is told a component is on the page that the visitor cannot see.
- recommended_action:
  kind: inline-fix
  detail: In putComponents, refuse (with a tool error naming the children) to give a non-container type to a component that has children after the edit.

### Finding 5: The promoted test "refuses an allowlisted host whose address is not public" is green without any fetch or address check

- kind: issue
- severity: medium
- direction: spec-signal
- locations:
  - file: test/data-fetch.test.ts:115
  - file: test/data-fetch.test.ts:135
  - file: src/agent/tools.ts:53
- evidence: |
  The diff drops `.fails` from this test, which is outside the brief's promotion list (the brief's rule promotes any pending test that starts passing). It passes because the page's loop has no `fetchUrl`, so `fetch_url` answers `is_error: true` with "fetch_url is not available on this page yet" (probe: the tool result sent back is exactly that), and no request reaches the local server. The test asserts only `is_error` and `hits === 0`, so any error satisfies it: it passes today with no fetch tool, and after fetch-tool it will still pass if the address is refused by the allowlist check, by a crash, or by anything other than the connection-time check seam/allowlist names. The run now reports seam/allowlist's connection-time refusal as holding when nothing implements it, and nothing will flag fetch-tool if its transport skips that check. The design round's test and the promote-whatever-passes rule together produced a green test that proves nothing.
- recommended_action:
  kind: follow-up-task
  detail: Strengthen the test so it can only pass through the server's transport (e.g. the error names the refused address as not public, and a control case with a public-address fake host succeeds), and keep it pending until fetch-tool lands.
  about: The test is meant to prove the server's own transport refuses an allowlisted name that resolves to a private address before connecting.
  blocks: nothing
  stopgap: Restore `it.fails` on the test and add `expect(resultText(result)).not.toContain("not available")`, so it is red-pending until a real fetch path answers, whichever stronger assertion the ask settles on.

### Finding 6: The relay handler rejects instead of answering when the Messages API cannot be reached

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/app.ts:75
- evidence: |
  `relay` awaits `fetchModel(...)` with no try/catch, so a network failure (DNS, connection reset, timeout) rejects the handler's promise instead of returning a `Response`. The handler's contract is `(Request) => Promise<Response>`; what the page then sees depends on whatever Node entry wraps it (not yet built). The page's loop only reads a status and body (`callModelThroughServer`), so a 502 with a JSON error from the relay would give the visitor a clear error state wherever the handler runs; a rejection may give a dropped connection or a generic 500, or crash an entry that does not catch it.
- recommended_action:
  kind: inline-fix
  detail: Catch a failed `fetchModel` in `relay` and return `problem(502, "the model could not be reached")`.

## Thoughts

- thought: The relay does not pass `request.signal` to `fetchModel`, so when stop-and-undo aborts the page's request the upstream model call still runs to completion; D6 says stopping aborts the turn's model request, and stop-and-undo will need the signal forwarded.
- thought: The table drawing keys `<th>`/`<td>` by column name, so duplicate names in `props.columns` give duplicate React keys.

## What I looked for and ruled out

Sub-par code: I checked the all-or-nothing edit (validation of every component and every parent before returning a new spec; a mixed valid/invalid call changes nothing), cycle detection in `isInside`, descendant removal, skeleton ids protected from replace and remove, `put` at the page root refused, binding validation, the `asText` path for every prop (no `dangerouslySetInnerHTML`, no `<img>`; image is a figure placeholder), consecutive user messages after an error (the API merges them, so the conversation stays valid), and the error state allowing a new turn. `tsc` is clean. The test diff only drops `.fails`; no other pending test was touched; each promoted test on the brief's list drives the scenario through the page and asserts on what the page draws, what the model received, or the traffic.

Design drift: the key appears only in the server's outbound header; the server's reply carries no upstream headers; model `claude-sonnet-5-5`, system prompt and `toolDefinitions` are fixed server-side and the page's own fields are ignored; the server keeps no state between requests; `src/page/` imports nothing from `src/render/`; one `stateLabel` mapping feeds the status; the snapshot goes with every visitor message and describes data by shape only; `beginTurn` is taken at the turn's start; nothing reaches browser storage (grep for localStorage, sessionStorage, indexedDB, cookie: none). The catalog's twelve entries are D9's eleven with form/button split, which matches the spec. The diff edits nothing under `docs/`, and I found no document it makes untrue.

Spec: beyond Finding 5, I saw no friction in the seam rows; the page store, tool and loop shapes composed as written.
