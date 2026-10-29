---
task_name: chart-and-actions
description: "Draw chart, image, form and button: charts bound to fetched data, images through the server, buttons and forms sending a visitor message"
change: first-agent-site
status: needs_review
merge_commit: 1ab1993975df29b68b75e76e06c1f0f917605e09
task_class: feature
on_critical_path: true

cites_seams:
  - seam/catalog
  - seam/renderer
  - seam/page-actions
  - seam/allowlist
cites_scenarios:
  - data-fetch § Fetch then display
  - page-spec § Data shown as a chart
  - page-spec § A button sends a visitor message

relations:
  blocked_by:
    - site-turn: { status: merged }
    - fetch-tool: { status: merged }
---

# chart-and-actions

## Summary

Complete the renderer for the catalog's remaining types (D9, D13, D8): chart (line, bar, pie) bound to page-spec data by path, drawn with `data-chart-kind` and `data-point-count`; image loaded only through the server under the allowlist; button and form that send a visitor message through the loop (a button its label, a form its filled-in fields).

## Cited seams

| seam/catalog | The component catalog is the one definition of the component types and their props: a page-spec tool accepts a component only when it validates against its entry, a rejection names the allowed types, the renderer draws each type through the catalog's entry, and no prop is drawn as markup. | =src/page/catalog.ts=: =catalog=, =validateComponent=; =src/render/registry.tsx=: =registry= | page-spec § An unknown type is rejected; page-spec § Data shown as a chart | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

How charts are drawn is the Implementor's choice (D1); a chart library is a new dependency with an exact version, or hand-drawn SVG. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/renderer | The renderer draws the page spec its page store holds and nothing else: one drawn element per component, marked with its id and type, with data bindings resolved against the page spec's data by one renderer-independent resolver; an edit redraws the components it changed and leaves every other drawn element in place. | =src/render/PageView.tsx=: =PageView=; =src/page/bindings.ts=: =resolveBindings= | page-spec § The skeleton on first load; page-spec § An edit appears without a reload; page-spec § Data shown as a chart | =test/page-spec.test.ts=; =test/data-fetch.test.ts= |

Bindings resolve through `resolveBindings`; the chart test reads `data-chart-kind` and `data-point-count` on the drawn element. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/page-actions | A form or button on the page acts only by sending a visitor message through the loop, as if the visitor typed it; the page spec holds no other action. | =src/render/registry.tsx=: =registry=; =src/agent/loop.ts=: =AgentLoop.send= | page-spec § A button sends a visitor message | =test/page-spec.test.ts= |

A press goes through `AgentLoop.send` as if typed; the page spec holds no other action. While a turn runs, decide whether presses are refused or queued and say which in Observations. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/allowlist | The server requests only from allowlisted hosts, checked on the parsed URL before any request and again on every redirect, and its own transport refuses at connection time a host whose address is not public; a host's secret goes only on requests to that host and is absent from everything the server returns; the page loads nothing from another host. | =server/fetchTool.ts=: =fetchForTool=; =server/app.ts=: =createApp= | data-fetch § A host not on the list is refused; data-fetch § A redirect off the list is not followed | =test/data-fetch.test.ts= |

An image `src` off the page's origin is never drawn as such; the server fetches it under the same allowlist (a host off the list draws no image). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

## Implementation steps

1. Keep test/data-fetch.test.ts "draws no image the page would load from another host" passing (site-turn promoted it).
2. Chart, image, form and button entries in `src/render/registry.tsx`.
3. An image route in `server/app.ts` reusing `fetchForTool`'s host checks and transport.
4. Pass the loop's `send` to the registry for buttons and forms.

## Verification

Run `npx vitest run --reporter=junit --passWithNoTests` and report the last 10 lines. Promote these pending tests by dropping `.fails` in the implementation commit; every other `it.fails` stays pending and green. A pending test outside this list that starts passing is promoted too and named in `## Observations`:

- test/data-fetch.test.ts: "fetches the forecast from the allowlisted weather host and draws a line chart of its series (Scenario: data-fetch § Fetch then display; page-spec § Data shown as a chart)"
- test/page-spec.test.ts: "sends a visitor message when the visitor presses a button the assistant drew (Scenario: page-spec § A button sends a visitor message)"

## Out-of-scope

- Any action vocabulary in the page spec (D13 rules it out).
- A second renderer.

## Observations

- Presses during a turn are refused, not queued: a button or form calls `AgentLoop.send`, which returns without effect while the loop is busy (the same rule the Send button follows). Nothing tells the visitor the press was ignored; thought: disable page buttons while a turn runs if that confuses visitors.
- Charts are hand-drawn SVG (D1 leaves the choice open), no new dependency. `data-point-count` counts the values that are numbers (numeric strings included); a value that is not a number is not drawn and not counted. The chart is a `<figure>` carrying the marks plus `data-chart-kind`/`data-point-count`.
- Image route: `GET /api/image?src=<url>` in `server/app.ts`. To reuse the fetch tool's host checks and transport, `fetchForTool`'s request/redirect loop was extracted into `fetchAllowed` in `server/fetchTool.ts` (behaviour of `fetchForTool` unchanged; its tests stay green). `fetchImage` returns only `image/*` other than SVG, and refuses an image whose bytes contain a host's secret; a refusal is a 403 naming only the host. The renderer draws `<img src="/api/image?src=...">` only for an http(s) src; the alt text is shown as a caption either way, so an image off the list shows its alt and no image.
- `IMAGE_PATH` and `imageThroughServer` live in `src/page/catalog.ts` beside the image entry, so the server and the registry share one path without the server importing a .tsx module.
- A form sends one line per field, "<label>: <value>", joined by newlines; its submit button reads `submitLabel` or "Send".
- No test covers bar or pie charts, the image route returning an allowlisted image, or form submission (weak coverage; only line chart and button are asserted).
- No pending test outside the Verification list started passing.

## Discoveries

- discovery_id: disc-chart-and-actions-1
  class: interface-drift
  description: seam/allowlist names only `fetchForTool` and `createApp` as owners, but the allowlist checks now live in `fetchAllowed`, shared by `fetchForTool` and `fetchImage` (the image route D8 requires).
  affected_seam: seam/allowlist
  kind: question
  severity: low
  evidence: server/fetchTool.ts `fetchAllowed`, `fetchImage`; server/app.ts image route at `IMAGE_PATH`.
  recommendation: add `fetchAllowed`/`fetchImage` to the row's owning symbols, and name data-fetch's "draws no image the page would load from another host" test in its tests column.
