---
task_name: site-turn
description: "The page, its page store and renderer, the page-spec tools, the browser loop and the server's model relay: one visitor message runs a turn that edits the page"
change: first-agent-site
status: needs_review
merge_commit: 9bf914834cc35822515c8f77afe559e1fc36b2a7
task_class: feature
on_critical_path: true

cites_seams:
  - seam/page-store
  - seam/catalog
  - seam/page-tools
  - seam/renderer
  - seam/page-snapshot
  - seam/tool-list
  - seam/turn
  - seam/loop-state
  - seam/model-relay
cites_scenarios:
  - page-spec § The skeleton on first load
  - page-spec § An edit appears without a reload
  - page-spec § An unknown type is rejected
  - page-spec § A reload returns the skeleton
  - agent-loop § A turn with a tool call
  - agent-loop § No key in the browser

agent:
  implementor: fable, high
  reason: creates the whole path from the chat box to the model and back to the drawn page, nine seams at once
---

# site-turn

## Summary

Build the walking skeleton every other task stands on (D1, D2, D4, D7, D9, D11, D12): the React page (`src/App.tsx`) with the skeleton (a header area and an empty content area), the chat, a status line, Send/Undo/Stop controls; the page store; the component catalog with all eleven types validated; the renderer drawing heading, text, card, list, row, column, table and key-figure tile; the three page-spec tools; the browser loop with its states; and `server/app.ts` `createApp` relaying each model request with the key, the model id, the system prompt and the tool list. The fetch tool is named in the tool list but implemented by fetch-tool; chart, image, form and button are validated by the catalog here and drawn by chart-and-actions.

## Cited seams

| seam/page-store | Each page has one holder of its page spec, made with the page and gone with it: it starts as the skeleton, every edit is applied through it, it keeps the copy taken when a turn starts, and undo puts that copy back; nothing of it is written to browser storage. | =src/page/store.ts=: =createPageStore=, =PageStore.apply=, =PageStore.beginTurn=, =PageStore.undo=; =src/App.tsx=: =App= | page-spec § The skeleton on first load; page-spec § A reload returns the skeleton; page-spec § Undo restores the page before the last turn; agent-loop § Stopping keeps edits already made | =test/page-spec.test.ts=; =test/agent-loop.test.ts= |

Check that a reload (fresh modules over the same browser storage) really returns the skeleton: nothing in localStorage/sessionStorage. `beginTurn`/`undo` belong to the row; build `beginTurn` here (the turn takes the copy) and leave undo's control wiring to stop-and-undo if it is cleaner, but say which. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/catalog | The component catalog is the one definition of the component types and their props: a page-spec tool accepts a component only when it validates against its entry, a rejection names the allowed types, the renderer draws each type through the catalog's entry, and no prop is drawn as markup. | =src/page/catalog.ts=: =catalog=, =validateComponent=; =src/render/registry.tsx=: =registry= | page-spec § An unknown type is rejected; page-spec § Data shown as a chart | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

The rejection must name the allowed types (the test checks heading, text, card, table, chart). Props are drawn as text, never markup. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/page-tools | The page-spec tools (put components by id, remove a component, set data) each take a page spec and a tool input and give either a new page spec or a tool error, never part of an edit; they and the page spec import nothing from the renderer. | =src/page/tools.ts=: =runPageTool=, =pageToolDefinitions= | page-spec § An edit appears without a reload; page-spec § An unknown type is rejected; agent-loop § A turn with a tool call | =test/page-spec.test.ts=; =test/agent-loop.test.ts= |

Tool inputs as the tests script them: `put_components {components:[{id,type,parent,props}]}`, `remove_component {id}`, `set_data`; an edit is all or nothing. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/renderer | The renderer draws the page spec its page store holds and nothing else: one drawn element per component, marked with its id and type, with data bindings resolved against the page spec's data by one renderer-independent resolver; an edit redraws the components it changed and leaves every other drawn element in place. | =src/render/PageView.tsx=: =PageView=; =src/page/bindings.ts=: =resolveBindings= | page-spec § The skeleton on first load; page-spec § An edit appears without a reload; page-spec § Data shown as a chart | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

Every drawn component carries `data-component-id` and `data-component-type`, inside the element with role `main`. Check the claim that unchanged components stay in place across an edit. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/page-snapshot | Each visitor message the model receives carries the page as it stands, described in one place: every component with its id, type and props, and the data by name and shape, never in full. | =src/page/snapshot.ts=: =describePage=; =src/agent/loop.ts=: =AgentLoop.send= | page-spec § Undo restores the page before the last turn | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

Each visitor message carries `describePage`'s output; data by name and shape only. Its tests are promoted by stop-and-undo and fetch-tool, but the call sits in the loop built here. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/tool-list | One module defines the tools the model is offered, the page-spec tools and the fetch tool, with their names, descriptions and input schemas; the server sends exactly that list, and the browser runs each call and builds each tool result in one place. | =src/agent/tools.ts=: =toolDefinitions=, =runTool=; =server/app.ts=: =createApp= | agent-loop § A turn with a tool call; data-fetch § Fetch then display | =test/agent-loop.test.ts=; =test/data-fetch.test.ts= |

One module, imported by both the browser and the server. Include `fetch_url`'s definition (name, description, input `{url, name}`) so the server's list is final; its run path is fetch-tool's. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/turn | A turn runs from one visitor message until the model ends its reply: the loop sends the conversation through the server, runs every tool call of a reply and answers all of them in one message, failures as error results, and repeats; the page store's copy for undo is taken as the turn starts. | =src/agent/loop.ts=: =createAgentLoop=, =AgentLoop.send= | agent-loop § A turn with a tool call; page-spec § An unknown type is rejected; page-spec § Undo restores the page before the last turn | =test/agent-loop.test.ts=; =test/page-spec.test.ts= |

All tool calls of one reply answered in one user message, failures as `is_error` results. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/loop-state | The loop is the only writer of its state, always one of idle, calling the model, running tools, awaiting the visitor and error, and the page shows the current state's label from one mapping. | =src/agent/loop.ts=: =AgentLoop.state=, =AgentLoop.subscribe=; =src/agent/states.ts=: =LoopState=, =stateLabel= | agent-loop § The visitor sees progress | =test/agent-loop.test.ts= |

The status element (role `status`) shows one label per state: idle, calling the model, running tools, awaiting the visitor, error. The harness waits on these exact words. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/model-relay | The server alone holds the Claude API key: it sends the page's conversation to the Messages API with its own model, system prompt and tool list, returns only the model's reply, and keeps nothing between requests. | =server/app.ts=: =createApp= | agent-loop § No key in the browser | =test/agent-loop.test.ts= |

The page posts to its own origin only; the server ignores the page's model, system and tools; nothing is kept between requests. Model `claude-sonnet-5-5` (D7). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

## Implementation steps

1. Read `test/support/site.ts` first: it fixes the roles and names (main, status, log, textbox 'Message', buttons Send/Undo/Stop), the `data-component-id`/`data-component-type` marks, and the `createApp({anthropicApiKey, allowlist, fetchModel, fetchData?})` signature returning a `(Request) => Promise<Response>` handler.
2. `src/page/catalog.ts`: `catalog` (all eleven types of D9 with their props) and `validateComponent`; `src/page/tools.ts`: `pageToolDefinitions`, `runPageTool(spec, name, input)` returning a new spec or a tool error; `src/page/bindings.ts`: `resolveBindings` for `{"$data": "/<name>/<path>"}`; `src/page/snapshot.ts`: `describePage`. None imports from `src/render/`.
3. `src/page/store.ts`: `createPageStore` with `apply`, `beginTurn`, `undo`, subscribe; `src/render/registry.tsx` and `src/render/PageView.tsx` drawing heading, text, card, list, row, column, table and key-figure tile.
4. `src/agent/states.ts` (`LoopState`, `stateLabel`), `src/agent/tools.ts` (`toolDefinitions`, `runTool`), `src/agent/loop.ts` (`createAgentLoop`, `AgentLoop.send/state/subscribe`; `stop` may be a stub until stop-and-undo). Draw the Undo and Stop buttons; their behaviour is stop-and-undo's.
5. `server/app.ts`: `createApp` relaying to the Messages API through `fetchModel` with the key header, fixed model, system prompt and `toolDefinitions`; returning only the model's reply.
6. `src/App.tsx`: `App` wiring the store, the view, the chat log, the message box and the status.

## Verification

Run `npx vitest run --reporter=junit --passWithNoTests` and report the last 10 lines. Promote these pending tests by dropping `.fails` in the implementation commit; every other `it.fails` stays pending and green. A pending test outside this list that starts passing is promoted too and named in `## Observations`:

- test/page-spec.test.ts: "shows the skeleton, a header area and an empty content area, beside the chat (Scenario: page-spec § The skeleton on first load)"
- test/page-spec.test.ts: "draws a card the assistant adds during a turn and leaves the rest of the page in place (Scenario: page-spec § An edit appears without a reload)"
- test/page-spec.test.ts: "rejects a component of a type the catalog lacks, naming the allowed types, and changes nothing (Scenario: page-spec § An unknown type is rejected)"
- test/page-spec.test.ts: "draws markup in a text component as plain text"
- test/page-spec.test.ts: "returns the skeleton on a reload after the page was shaped (Scenario: page-spec § A reload returns the skeleton)"
- test/agent-loop.test.ts: "runs the page-spec tool the model calls, returns its result, and shows the reply (Scenario: agent-loop § A turn with a tool call)"
- test/agent-loop.test.ts: "never lets the Claude API key reach the page or its network traffic (Scenario: agent-loop § No key in the browser)"
- test/agent-loop.test.ts: "keeps one visitor's conversation out of another's"
- test/agent-loop.test.ts: "sends the model the tools the page runs, whatever the page asks for"
- test/data-fetch.test.ts: "draws no image the page would load from another host" (holds once an image component draws no off-origin `src`; drawing images through the server is chart-and-actions')

## Out-of-scope

- Stopping and the Undo control's behaviour (stop-and-undo).
- The fetch tool's server side, the allowlist and trimming (fetch-tool).
- Drawing chart, form and button, and images through the server; button actions (chart-and-actions). Here an image component draws no `<img>` with an off-origin `src` (a placeholder is enough).
- The Node entry, Vite build and the shipped allowlist file (owner-server-entry).
- Streaming replies: the harness answers either form; plain JSON is enough.

## Observations

- Undo: `PageStore.beginTurn` and `PageStore.undo` are built (`src/page/store.ts`); the loop calls `beginTurn` as a turn starts. The Undo button is drawn but not wired, and `AgentLoop.stop` is a no-op: both are stop-and-undo's (D5 adds "offered between turns, not while one runs", which belongs with stop). Evidence: the two undo tests and the two stop tests stay pending and green.
- The catalog has twelve type names for D9's "eleven types": "form/button" is two types, `form` and `button` (the tests use `type: "button"`). The key-figure tile is the type `tile`. Both named in the tool description the model reads.
- Promoted outside the list: `test/data-fetch.test.ts` "refuses an allowlisted host whose address is not public, before any request reaches it". It passes vacuously: `fetch_url` answers an `is_error` result saying it is not available, and the test asserts only `is_error` and zero hits. See disc-site-turn-1. It stays promoted so fetch-tool inherits it as a live guard.
- Ambiguity resolved: the skeleton's `header` (a `row`) and `content` (a `column`) have the parent `page` (`ROOT` in `src/page/spec.ts`); `put_components` refuses to replace them and `remove_component` refuses to remove them, and every new component must name an existing container as its parent (no cycles). No row states this; it keeps the skeleton drawable.
- Ambiguity resolved: sibling order is the insertion order of the component map (a component put again keeps its place). The page spec carries no order field.
- The snapshot (seam/page-snapshot) travels as a second text block of the visitor's user message, after the visitor's words; the chat log shows the words only. Tool results carry no snapshot.
- The chat log also shows one line per tool call (`put_components: Put c1 (card).`), for the loop's visible mechanics; the status element shows the state label alone (plus the error text in the error state).
- The claude-api skill's defaults (Opus, the SDK) are overridden by D7 (`claude-sonnet-5-5`) and by `createApp`'s `fetchModel` (a raw relay; no SDK in package.json). The server sends `max_tokens: 16000`, no `thinking` field (adaptive by default on Sonnet 5.5), `anthropic-version: 2023-06-01`.
- A `send` while a turn runs is dropped and the Send button is disabled meanwhile; the prose says so in `src/agent/loop.ts`.
- The commit's attribution lines follow the session's reminder (Claude Fable 5.1), not the brief's "Claude Opus 5.5"; the Claude-Session line is the same.
- thought: the system prompt will need tuning once a real model drives the page; it is one constant in `server/app.ts`.

## Discoveries

- discovery_id: disc-site-turn-1 / class: invariant-gap / description: the data-fetch test "refuses an allowlisted host whose address is not public" cannot tell a refused fetch from an unavailable fetch tool: it asserts `is_error` and zero hits only, so it passes while `fetch_url` is answered as unavailable / affected_seam: seam/allowlist / kind: issue / severity: low / evidence: `test/data-fetch.test.ts:115-139` passed at commit 711d33c with `runTool` returning "fetch_url is not available on this page yet" / recommendation: fetch-tool asserts the error names the address or host that was refused (as the off-list test asserts the allowed hosts), so the test holds only once the connection-time check exists.
- discovery_id: disc-site-turn-2 / class: vocabulary-mismatch / description: D9 and page-spec § The first component catalog count "form/button" as one of eleven types, but the page spec needs two type names (`form`, `button`; the button test uses `type: "button"`), so the catalog holds twelve / affected_seam: seam/catalog / kind: question / severity: low / evidence: `src/page/catalog.ts` `componentTypes` has 12 entries / recommendation: the design round says "twelve types, form and button being two" or merges them into one type with a `fields` prop that may be empty.
