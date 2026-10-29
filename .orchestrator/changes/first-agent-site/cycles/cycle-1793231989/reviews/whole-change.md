---
task_name: whole-change
merge_commit: 6f780ed6f28d99990dbfa593bfbebaaf5cfc87a3
reviewed_at: 2026-10-29T01:12:00Z
finding_count: 13
clean_review: false
---

## Summary

I reviewed the whole diff `0d4b75e..6f780ed` outside `.orchestrator/`: the specs, glossary, research brief, `design.org` (D1-D13, all 13 seam rows), the scaffold (`package.json`, `.npmrc`, `vite.config.ts`, `tsconfig.json`, `allowlist.json`, `index.html`), every file under `src/` and `server/`, the harness and the three test files. I judged them against R1-R7 of `intent.org`. The main checkout is code-identical to the merge commit outside `.orchestrator/`, so I ran the test command there: 30 tests, 0 failures, 0 skipped. The brief's count of 23 predates the inline-fix tests. All 15 scenario titles appear in the junit testcase names and pass.

I ran probes against a `git archive` of the merge commit in scratch:
- `tsc --noEmit` is clean.
- `npm run build` followed by the built `node dist-server/main.js` (ephemeral port, fake keys) serves the page, and no key string is in the bundle.
- The real Vite dev server answers `/api/`.
- The server's own transport fetched the real `api.open-meteo.com` forecast in 185 ms.
- Scripted probes drove the page-spec tools, the renderer, the loop and the fetch tool on edge inputs.

The main path works end to end on these surfaces. A visitor asks, the model calls a page-spec tool and the page redraws. The weather data comes from the real host and a line chart is drawn. Stop, undo and reload behave as specified, the key stays on the server, and a form or button sends a message.

Findings:
- On R2's main path, the assistant is never told which hosts are allowlisted (finding 1).
- On R2's main path, a binding that resolves to nothing is reported as a successful put and draws an empty component (finding 2).
- Spec-signal: bindings are bare paths, so the shipped weather source's columnar data cannot become a table (finding 3).
- On R1's main path, replacing a container by a non-container leaves undrawn children in the page spec (finding 4).
- Off the main path, a keyed host's secret leaks to the browser and the model when the host echoes it JSON-escaped (finding 5, high).
- Further off-path defects in the loop, the relay, the fetch transport, the allowlist loader and the page-spec tools, two untrue harness comments, and a second spec-signal on component order (findings 6-13).

## Findings

### Finding 1: The assistant is never told which hosts are on the allowlist

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: server/app.ts:35
  - file: server/app.ts:100
  - file: src/agent/tools.ts:15
- evidence: |
  `SYSTEM_PROMPT` and `toolDefinitions` are constants, and neither names a host. A probe gave `SYSTEM_PROMPT + JSON.stringify(toolDefinitions)` with `includes("open-meteo") === false` and `includes("football-data") === false`. `createApp` holds the resolved allowlist (app.ts:58), but uses it only in the fetch and image routes. The system prompt only says "call fetch_url with a URL on an allowlisted host" (app.ts:51), and the tool says "allows only the hosts on its allowlist".

  So the model learns the list only from the error of a refused `fetch_url` call. Asked for "the weather for Lisbon as a chart", it must guess `api.open-meteo.com`, and any other weather host costs a refused call and a round trip first. The keyed source the change ships (`api.football-data.org`, D10), or any host the owner adds, is unknown to the assistant until a call fails. "Adding a source means adding a host to the list" (R2) therefore does not let the assistant offer that source. This is on R2's main path.
- recommended_action:
  kind: inline-fix
  detail: createApp appends the resolved host names (never secrets) to the system prompt it sends. The text is fixed for the life of the server process, so the prompt stays byte-identical within a visit (preserved-thinking check).

### Finding 2: A binding that resolves to nothing or to the wrong kind is reported as a successful put

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: src/page/catalog.ts:168
  - file: src/render/registry.tsx:116
  - file: src/render/registry.tsx:89
- evidence: |
  `validateComponent` checks only that a binding's `$data` starts with "/". Nothing resolves it, and the drawing silently falls back to an empty array.

  - Probe P12: the data holds `lisbon.hourly.temperature_2m`. Putting a line chart with `values: {"$data": "/lisbon/hourly/temperature"}` returned `{"type":"tool_result","tool_use_id":"t1","content":"Put ch (chart)."}` with no `is_error`, and the drawn chart had `data-point-count="0"`.
  - Probe P4: a table with `rows` bound to an object drew `<table ...><thead><tr></tr></thead><tbody></tbody></table>`, again with an ok result.

  The model cannot see the page, so it tells the visitor the chart is there while an empty frame is drawn. D9 says "Each type's props are validated where the catalog defines it", but a bound prop's value is never checked against its kind. This is on R2's main path: any misjudged path in the ordinary "show it as a chart" request.
- recommended_action:
  kind: inline-fix
  detail: put_components resolves each binding against the current data. Its successful result adds a note for each binding that resolves to nothing or not to the prop's kind, e.g. "values resolves to nothing at the moment". It keeps the edit, since data may still arrive later in the same reply.

### Finding 3: A binding is a bare path, so fetched data can be shown only in the shape the API returns

- kind: issue
- severity: medium
- direction: spec-signal
- locations:
  - file: src/page/bindings.ts:25
  - file: src/render/registry.tsx:89
  - file: docs/changes/first-agent-site/design.org (D3, D11)
- evidence: |
  The shipped weather source answers in columns. Probe P10 against the real `api.open-meteo.com` returned `hourly: {time: [...], temperature_2m: [...]}`. The catalog's table takes `rows`, an array of objects, so "show it as a table", the obvious next refinement after the chart, cannot be bound: probe P4 drew an empty table. Two more refinements cannot be expressed either:
  - A nested field, such as football-data's `team.name`, cannot be a column. `row[column]` reads one key, and a nested object is drawn as JSON text.
  - Part of a series, such as "only the next 12 hours", cannot be bound. A path picks one element or the whole array.

  The model's remaining route is to copy values into literal props or `set_data`. D3 exists to avoid exactly that, and the trimmed view may not hold the values in full. R2 says the visitor refines the display in conversation. With bare paths, a refinement that reshapes data needs either a new fetch with different API parameters or a trip through the model's context.
- recommended_action:
  kind: route-to-user
  detail: Decide whether bindings gain a small transform (columns to rows for a table, a nested column path, a slice), whether the table accepts columnar data, or whether copying values through the model is accepted for the experiment.
  about: Bindings are how fetched data reaches a component without passing through the model (D3, D11); the question is how much reshaping a binding can express.
  blocks: next-plan
  stopgap: Finding 2's note in the put_components result names a bound prop that resolves to nothing or to the wrong kind. That holds whichever option is chosen, and it makes the empty table loud to the model.

### Finding 4: Replacing a container that has children with a non-container leaves the children in the page spec, undrawn

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: src/page/tools.ts:112
  - file: docs/specs/page-spec.org (Requirement: The page is drawn from the page spec)
- evidence: |
  The parent check in `putComponents` runs only over the components being put, never over the existing children of a component whose type changes. Probe P1:
  1. Put card `c1` with text `t1` inside it.
  2. Put `c1` again as a heading. The result is `"Put c1 (heading)."`, ok.
  3. The page spec still holds `t1` with parent `c1`, and `describePage` tells the model `t1:text<c1`.
  4. The page draws only `header, content, c1`.
  5. A later put into `c1` is refused: "component 't2': 'c1' is a heading, not a container".

  The model and the visitor now disagree about what is on the page, against page-spec's "The page SHALL show exactly what the page spec describes". This is on R1's main path: turning a card into a heading in place is an ordinary reshaping edit by id.
- recommended_action:
  kind: inline-fix
  detail: For each put component whose new type is not a container, putComponents refuses the edit when any component in `next` has it as parent, naming those children. The alternative is to remove them and say so in the result.

### Finding 5: A keyed host's secret reaches the browser and the model when the host echoes it in an escaped JSON form

- kind: issue
- severity: high
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:45
  - file: server/fetchTool.ts:49
  - file: server/fetchTool.ts:155
  - file: server/fetchTool.ts:4
- evidence: |
  `scrub` runs on the raw body text and looks for two forms: the secret, and `JSON.stringify(secret)` without its quotes. `JSON.parse` then decodes every other escape, after the scrub.
  - Probe P5: the secret `AbC/dEf+gh==` was echoed as `{"echo":"AbC\/dEf+gh=="}` (escaped slash, as PHP's json_encode writes it). The outcome's `data` was `{"echo":"AbC/dEf+gh=="}`, which is sent to the browser and kept in the page spec. The view, which the model reads, held `{"echo":"AbC\/dEf+gh=="}`.
  - Probe P6: a plain secret echoed with a `p` escape came back raw in `data`.

  seam/allowlist ("absent from everything the server returns"), data-fetch § Secrets added by the server ("the key never reaches the model or the browser") and the module header's "removed from everything returned" all fail here. This is off the main path: it needs a keyed host that echoes its own key in an escaped form. The shipped football-data token is hex, and the suite's echo test covers only the unescaped form.
- recommended_action:
  kind: inline-fix
  detail: After parsing, walk the parsed value and scrub every string and key. As a last check, return a tool error when the view or JSON.stringify of the data still contains any secret, raw or JSON-escaped.

### Finding 6: The loop never reads stop_reason, so a refusal ends the turn silently and a max_tokens cut is shown as a finished reply

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: src/agent/loop.ts:125
  - file: src/agent/loop.ts:140
- evidence: |
  Probe P8 drove `createAgentLoop` with a scripted `callModel`:
  - A reply `{content: [], stop_reason: "refusal"}` ended with `state=awaiting_visitor`, `error=null`, and a chat holding only the visitor's words: no reply and no error.
  - A reply cut at `max_tokens` ("Here is the first half of my ans") was shown as the assistant's complete answer. A `tool_use` cut by `max_tokens` would be run.

  Per the Claude API reference, `claude-sonnet-5-5` declines with HTTP 200 and `stop_reason: "refusal"` in five categories, including `general_harms`, which benign work can trigger. agent-loop § One loop runs to completion says the loop repeats "until the model ends its turn or an error occurs". A refusal or a cut is neither ended normally nor shown as an error. This is off the main path: it needs a classifier decline or a reply that reaches 16000 tokens.
- recommended_action:
  kind: inline-fix
  detail: On "refusal", go to the error state with a message that the model declined, and keep no empty reply. On "max_tokens", show that the reply was cut and answer its tool calls with error results instead of running them, so the conversation stays valid.

### Finding 7: After a failed turn the failed request stays live and is merged into the next visitor message with no note

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/agent/loop.ts:101
  - file: src/agent/loop.ts:143
- evidence: |
  When `callModel` throws (a server 500, a network error, a Messages API 529), the conversation ends on the user message that carries the failed request. The next visitor message is appended to that same message (loop.ts:101), and nothing tells the model the earlier request failed. A visitor who sees "error: ..." and retypes the request sends it twice in one message. One who moves on sends the old request along with the new one. The stop path got exactly this note (`stoppedNote`, loop.ts:93); the error path did not. This is off the main path: it needs a failure of the server or of the Messages API.
- recommended_action:
  kind: inline-fix
  detail: The error path sets a one-time note, as stop does, e.g. "the previous request failed before you answered; the visitor saw an error". It is sent with the next visitor message.

### Finding 8: The page-spec tools cannot place a component within its container

- kind: issue
- severity: low
- direction: spec-signal
- locations:
  - file: src/page/spec.ts:36
  - file: src/page/tools.ts:21
  - file: docs/specs/page-spec.org (Requirement: The page is drawn from the page spec)
- evidence: |
  Sibling order is the page spec's insertion order (spec.ts:36), and no tool input names a position. Probe P13:
  - Putting `chart` again leaves `content` as `table,box,chart`: a component put again keeps its place.
  - A new component goes last.
  - Moving `table` into `box` drew it before `note`, which was already there. A moved component lands by when it was first put, neither first nor last.

  "Put the chart above the table" is a plain R1 layout change. It can be done only by removing and re-putting every sibling that should come after the chart, with their subtrees, since remove_component removes descendants. Neither page-spec, D11 nor the tool descriptions say anything about order, so the model is not told how placement works either.
- recommended_action:
  kind: route-to-user
  detail: Decide whether put_components takes a position (before or after an id, or an index), or whether remove-and-re-put is accepted for the experiment.
  about: The page-spec tools are the assistant's only way to reshape the page (R1); the question is whether they express where in a container a component goes.
  blocks: nothing
  stopgap: The put_components result lists each touched container's children in order after the edit. A put meant to move a component then shows the model that it did not move.

### Finding 9: Component ids that name Object.prototype members, or the root's name, give false results

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/page/tools.ts:109
  - file: src/page/tools.ts:113
  - file: src/page/tools.ts:115
  - file: src/page/tools.ts:142
- evidence: |
  The tools accept model-chosen ids, and these give false results:
  - Probe P2, `__proto__`: put_components with id "__proto__" answers "Put __proto__ (text)." but stores nothing. The assignment sets the map's prototype, and the own keys stay `header,content`.
  - Probe P2, prototype names: remove_component of "constructor", "toString" or "__proto__" on a page without them answers "Removed constructor." and so on.
  - Probe P2, parent "toString": this throws inside putComponents and surfaces as "put_components failed: Cannot read properties of undefined (reading 'container')".
  - Probe P3, id "page": this is the root parent's name (`ROOT`), and the id is refused as "component 'page' cannot sit inside itself".

  This is off the main path: it needs the model to choose such an id.
- recommended_action:
  kind: inline-fix
  detail: Look components up with Object.hasOwn (or null-prototype maps) in tools.ts. Refuse the reserved id "page" with a message that names it.

### Finding 10: The relay forwards the page's messages unchecked, including system-role messages

- kind: issue
- severity: low
- direction: design-drift
- locations:
  - file: server/app.ts:89
  - file: server/app.ts:100
  - file: server/app.ts:4
- evidence: |
  `relay` checks only that `messages` is an array, then sends it verbatim. Per the Claude API reference, `claude-sonnet-5-5` accepts `{"role": "system"}` entries inside `messages` as operator instructions (mid-conversation system messages, no beta header). A page that sends one therefore adds system instructions the server did not fix. The same field carries any other block the API takes, such as image or document blocks with URL sources that Anthropic fetches.

  D7 says "whatever else the page sends is ignored", and agent-loop says "The server fixes the system prompt and the tool list in its own code". The test of that (test/agent-loop.test.ts:164) forges only the top-level `system`, `tools` and `model`. This is off the main path: it needs a visitor crafting requests. That visitor affects only their own conversation, and abuse controls are a non-goal.
- recommended_action:
  kind: inline-fix
  detail: The relay accepts only user and assistant messages, whose blocks are text, tool_use, tool_result or the model's own returned blocks (thinking). It answers 400 otherwise.

### Finding 11: The server's transport holds a whole response in memory with no size cap and only an idle timeout

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:267
  - file: server/fetchTool.ts:259
- evidence: |
  `publicOnlyFetch` collects every chunk with no limit. `fetchForTool` then holds the text, the parsed value and `Response.json` of the outcome, so a response of N bytes costs several N on the owner's server and is all sent to the browser.

  `timeout: TIMEOUT_MS` is Node's socket idle timeout, not a deadline. A host that sends a byte every few seconds keeps the turn in "running tools" indefinitely, although the error text promises "no answer from <host> in 20 seconds". This is off the main path: it needs a size beyond the ordinary or a slow remote host.
- recommended_action:
  kind: follow-up-task
  detail: Cap the bytes read, with a tool error that names the cap, and add a total deadline for each request.

### Finding 12: An allowlist entry that can never match is accepted and logged as allowed

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/config.ts:35
  - file: allowlist.json:2
- evidence: |
  `resolveAllowlist` checks only that `host` is a non-empty string, while `fetchAllowed` compares entries with `URL.hostname`. An owner who writes any of these has an entry that can never match:
  - `"https://api.coingecko.com"`
  - `"api.coingecko.com:443"`
  - `"api.coingecko.com "` (trailing space)

  For the first, the start log prints `allowlist: https://api.coingecko.com`, and every fetch is refused with "api.coingecko.com is not on the allowlist; the allowed hosts are https://api.coingecko.com". Adding a source is the owner's edit to this file (R2). This is off the main path: it needs a malformed entry.
- recommended_action:
  kind: inline-fix
  detail: At start, refuse an entry that is not a bare hostname, naming it. The test is `new URL("https://" + host).hostname === host.toLowerCase()`.

### Finding 13: Two comments in the test harness are untrue

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: test/support/site.ts:191
  - file: test/support/load.ts:2
- evidence: |
  - site.ts:191-193: the comment says a request that names a connection dispatcher "is the server's own outbound transport, never the page", and hands it to the real fetch. The server's own transport (`publicOnlyFetch`) uses `node:http` and never calls fetch, and nothing under src/, server/ or test/ passes a `dispatcher` (grep). The branch is dead and its sentence untrue. It is also a gap in the page-origin check the scenario tests rely on: any fetch carrying a `dispatcher` key bypasses it.
  - load.ts:2: "The pending tests reach the code through this". No pending test is left, since test/ has no `it.fails`.

  This is test-harness prose and dead code, on no path of the product.
- recommended_action:
  kind: inline-fix
  detail: Delete the dispatcher branch and its comment. Reword load.ts's comment to say why tests import at run time (a reload gets fresh modules after vi.resetModules).

## Thoughts

- thought: `RELAY_PATH` (src/agent/loop.ts:49) and `MESSAGES_PATH` (server/app.ts:27) are two constants for one path, and vite.config.ts:41 spells "/api/" beside `SERVER_PREFIX` (server/config.ts); they agree today.
- thought: FakeModel's event-stream branch (test/support/site.ts:96, :122-142) is never taken, since the relay never asks for a stream.
- thought: claude-sonnet-5-5 returns between-tool-call notes longer than a sentence as thinking blocks, which are empty under the default display, so the chat shows only final text and tool lines. `thinking: {type: "adaptive", display: "updates"}` (beta) would show them if the experiment wants that mechanic visible.
- thought: A fetch_url line in the chat holds the whole model view, up to 20,000 characters of raw JSON.
- thought: The shipped keyed source's crest images are served from crests.football-data.org, which is not in allowlist.json, so a crest the assistant draws is refused (the alt text stays).

## What I looked for and ruled out

**Sub-par code.**
- Every abort check in the loop holds. Each await in `send` is followed by an aborted check, a stale `send`'s `finally` cannot clear a newer turn, and `stop()` answers every unanswered call. No interleaving of Stop with a page tool exists, since page tools run synchronously.
- Undo is one step, is disabled while a turn runs, and restores data with components.
- XSS: every prop is drawn as text. An image loads only through `/api/image`, which answers only with server-named raster types under `nosniff` and a sandbox CSP.
- `serveWith` and `toRequest` handle a malformed path, a malformed Host header, a chunked body and traversal (`/../`, `%2e%2e`) on the real built entry.
- IPv4-mapped, decimal and hex IP literals are refused by the transport's address check.
- The http downgrade of a keyed host is refused.
- A form submits `City: Lisbon\nDays: 3` (D13).
- The type-check is clean.

**Design drift.** I checked each seam row's statement and owning symbols against the code. Every symbol exists and is the one producer. src/page imports nothing from src/render (page-spec § The renderer is swappable), and the server imports no React. The model id `claude-sonnet-5-5` is valid. A non-streaming request at 16000 max_tokens is in range, and `anthropic-version: 2023-06-01` is still accepted. The conversation is append-only: blocks are only ever added to the trailing user message after the last assistant reply, so Sonnet 5.5's history-editing check for thinking blocks holds, and thinking blocks are passed back unchanged. The built page holds no key string. Vite 8 rejects a foreign Host before plugin middleware, so the dev `/api/` routes keep the DNS-rebinding check.

**Spec wrong.** The spec edits, glossary and research brief agree with the intent and with the D10-D13 answers. Beyond findings 3 and 8, I found no case where a scenario's test passes while the visitor's or owner's surface fails. The real weather host, the built entry and the dev server each did what the scripted tests assume. The open relay and the cross-site use of the owner's server are cost and abuse concerns, which the intent names as a non-goal, so I did not report them.
