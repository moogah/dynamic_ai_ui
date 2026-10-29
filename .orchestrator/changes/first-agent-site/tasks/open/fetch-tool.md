---
task_name: fetch-tool
description: "The allowlisted fetch tool on the owner's server: allowlist checks, connection-time address check, secrets, trimming, and the data kept in the page spec"
change: first-agent-site
status: ready
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

## Observations

## Discoveries
