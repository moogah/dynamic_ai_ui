---
task_name: chart-and-actions
merge_commit: 1ab1993975df29b68b75e76e06c1f0f917605e09
reviewed_at: 2026-10-29T00:45:00Z
finding_count: 7
clean_review: false
---

## Summary

I read the diff (server/app.ts, server/fetchTool.ts, src/App.tsx, src/page/catalog.ts, src/render/PageView.tsx, src/render/registry.tsx and the two promoted tests) against the task brief, the four cited seam rows, D1, D8, D9 and D13, page-spec.org and data-fetch.org. I ran the test command once (23 tests, 0 failures), then ran probes from the scratch directory against the merge checkout: the real `createApp` handler on `/api/image` with scripted hosts, and the real page in jsdom through `test/support/site.ts`. The promotions are correct. Only the two named tests lost `.fails`, no other pending test was touched, no `it.fails` remains, and no docs were edited. Both promoted tests exercise their scenarios: the chart test fetches through the server, binds by path and reads kind and point count; the button test presses the drawn button and checks that a third model call carries "Show tomorrow". The allowlist refactor (`fetchAllowed`) keeps the host checks, redirect checks and secret header behaviour for both callers. The probes confirmed that off-list hosts, off-list redirects, `file:` URLs, SVG, HTML, 404s and an image echoing the secret are all refused. The main defect is in the image route: it passes the upstream Content-Type through after a one-type denylist, so a crafted type gets attacker bytes served as a document on the site's own origin. The rest are low-severity UI defects in the new drawings: the form's default "Send" label collides with the chat's Send, duplicate field names lose values, presses during a turn are dropped silently, the line chart forces a zero baseline and shows no labels, the pie's point count is wrong, and an off-list image draws as a broken image.

## Findings

### Finding 1: The image route serves any upstream Content-Type that starts with `image/` except exactly `image/svg+xml`, so crafted types are served as a document on the site's origin

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:118
  - file: server/fetchTool.ts:119
  - file: server/app.ts:77
- evidence: |
    `fetchImage` takes `content-type` up to the first `;` and refuses only `!startsWith("image/")` or `=== "image/svg+xml"`; app.ts then answers with that string as the Content-Type. Probe (real createApp, scripted host `img.ok`):
    `/api/image?src=https://img.ok/comma` (upstream `content-type: image/png, text/html`, body `<script>alert(document.domain)</script>`) -> `200`, `content-type: image/png, text/html`, body passed through unchanged.
    `/api/image?src=https://img.ok/xml` (upstream `image/x-foo+xml`, body `<x/>`) -> `200`, `content-type: image/x-foo+xml`.
    A browser extracts the MIME type of a comma-separated value by taking the last valid entry (`text/html`, Fetch spec "extract a MIME type"). It also renders any `+xml` type as an XML document, in which XHTML-namespaced `<script>` runs, the same reason SVG is refused. `nosniff` blocks neither. A visitor who opens such a `/api/image?src=...` link gets attacker script running on the site's origin. That script can call `/api/messages` (the owner's Claude key) and `/api/fetch`, which is the exfiltration path D8 guards against. This requires an allowlisted host to answer with a crafted type, but the code comment claims "returned only when it is a raster image", and nothing enforces that.
- recommended_action:
  kind: inline-fix
  detail: Accept only a fixed set of raster essences (image/png, image/jpeg, image/gif, image/webp, image/avif, perhaps image/bmp and image/x-icon) and write the response Content-Type from that set, never the upstream string. Also add `content-security-policy: default-src 'none'; sandbox` to the image response, and add a test for the route.

### Finding 2: A form's default submit label "Send" duplicates the chat's Send button, so the harness's `say` throws once a form is on the page

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/render/registry.tsx:155
  - file: test/support/site.ts (pageIn.say: `q.getByRole("button", { name: "Send" })`)
- evidence: |
    Probe: put a form with no `submitLabel`, settle, then `site.say("hello again")` -> throws `Found multiple elements with the role "button" and name "Send"`. Per D2, the page is found by accessible role and name, and the harness relies on there being one "Send". So any later scenario test that types after the assistant drew a form fails, and a screen-reader visitor hears two identically named Send buttons with different effects. The same collision occurs whenever the assistant labels a button "Send", "Undo" or "Stop", because the harness queries the whole container rather than the aside.
- recommended_action:
  kind: inline-fix
  detail: Give the form a default label that cannot collide (for example "Submit"), and scope the harness's chat queries to the aside. The harness is the design round's, so the second half goes to the orchestrator.

### Finding 3: Form fields that share a name lose all but the first value, with duplicate React keys

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/render/registry.tsx:140
  - file: src/render/registry.tsx:144
  - file: src/render/registry.tsx:150
- evidence: |
    `named` keeps the model's `name` as given; the message is built with `filled.get(f.name)`, which returns the first input of that name, and the `<label key={f.name}>` keys collide. Probe: fields `[{name:"city",label:"City"},{name:"city",label:"Town"}]`, inputs filled "Lisbon" and "Porto", then submit. The chat shows `City: Lisbon\nTown: Lisbon`, so the visitor's "Porto" never reaches the assistant. The catalog only checks `fields` is an array, so nothing rejects duplicates upstream.
- recommended_action:
  kind: inline-fix
  detail: Name inputs by index (or dedupe names) and read each field by that name. Alternatively, have validateComponent reject duplicate field names with an error the model reads.

### Finding 4: Page buttons and forms stay enabled during a turn, and a press is dropped with no sign to the visitor

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/App.tsx:49
  - file: src/render/registry.tsx:160
- evidence: |
    The chat's Send is disabled while busy, but page actions call `loop.send`, which returns silently when `isBusy`. Probe: draw button "Go", start a held turn, then press "Go". The button reads `disabled: false` while the chat Send reads `disabled: true`; after the turn ends there are 3 model calls, and the chat holds no trace of "Go". So refusal is what the code does, which the seam note asked to be decided, but the visitor sees an active control that does nothing. A form submission is lost the same way (its inputs keep their text, but nothing says it was not sent).
- recommended_action:
  kind: inline-fix
  detail: Pass busy state to the registry and disable buttons and form submit while a turn runs, matching the chat's Send. Alternatively, show a refusal line in the chat.

### Finding 5: The line chart always includes zero in its scale and shows no labels or scale, so the scenario's own series draws almost flat and unreadable

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/render/registry.tsx:194
  - file: src/render/registry.tsx:196
  - file: src/render/registry.tsx:202
- evidence: |
    `scale` uses `Math.min(0, ...values)` and `Math.max(0, ...values)` for every kind. Probe with the test's Lisbon series [18.1, 17.6, 17.2, 16.9]: the polyline spans y 24 to 34.08 out of a 24 to 176 plot area, about 10px of 152, a near-flat line at the top. A zero baseline is right for bars, but it hides a line's variation. The required `labels` prop and the values appear only in hover `<title>`s: no axis, tick or label text is drawn, so the visitor cannot read the chart without hovering each point (and touch devices cannot hover). Page-spec § Data shown as a chart asks for "a line chart of the series"; the attributes the test reads are right, but the drawing does not show the series legibly.
- recommended_action:
  kind: inline-fix
  detail: Scale line charts to the data's min and max (with padding), keep zero for bars, and draw at least the first and last labels plus min and max value text.

### Finding 6: `data-point-count` on a pie counts points that are not drawn

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/render/registry.tsx:119
  - file: src/render/registry.tsx:240
- evidence: |
    `Pie` drops non-positive values (`slices = points.filter(p => p.value > 0)`), but the figure's `data-point-count` and aria-label use `points.length`. Probe with values [5, -3, 0, 2]: `data-point-count="4"`, `aria-label="pie chart of 4 points"`, and 2 `<path>` slices. The seam/renderer marks are what tests and assistive technology read, so this mark claims more than is drawn.
- recommended_action:
  kind: inline-fix
  detail: Count what the pie draws (or say in the aria-label that values of zero or less are left out).

### Finding 7: An image from a host off the allowlist still draws an `<img>` (a broken-image icon), and its alt text is given twice; the code comment says no image appears

- kind: issue
- severity: low
- direction: design-drift
- locations:
  - file: src/render/registry.tsx:50
  - file: src/render/registry.tsx:56
  - file: src/render/registry.tsx:57
- evidence: |
    Every `http(s)` src draws `<img src="/api/image?src=...">`. For a host off the list the server answers 403 JSON (probe: `evil.example` -> 403 `{"error":"evil.example is not on the allowlist; ..."}`), so the browser shows a broken-image icon. The seam/allowlist note says "a host off the list draws no image", and the comment says "no image appears and the alt text stays". Both are true only in the sense that no pixels load. The alt text is also both the `<img alt>` and a `<figcaption>`, so assistive technology announces it twice. The promoted test only checks the `<img>` origin, which jsdom never loads, so nothing in the suite exercises this.
- recommended_action:
  kind: inline-fix
  detail: Hide the `<img>` on `onError` (leaving the caption), use an empty `alt` on the `<img>` when a figcaption already carries the text, and correct the comment.

## Thoughts

- thought: `/api/image` is a cross-origin simple GET, so any third-party page can make the owner's server fetch arbitrary paths on allowlisted hosts with the keyed host's secret attached, spending its quota. The intent lists abuse controls as a non-goal, and `/api/fetch` already accepts a text/plain cross-origin POST, so this only matters if that non-goal changes.
- thought: `fetchImage` (via `publicOnlyFetch`, which buffers the whole body) has no size cap. A large image from an allowlisted host is held whole in server memory before it is checked; the fetch tool shares this.
- thought: The seam/allowlist row names `fetchForTool` as owner. The checks now live in `fetchAllowed`, shared by `fetchForTool` and `fetchImage`, and the image route (`IMAGE_PATH` in src/page/catalog.ts) is a second consumer. Adding them to the row's owning symbols would keep the next reviewer pointed at the right code.
- thought: No test covers `/api/image` itself (allowlist, redirect, SVG refusal, secret refusal all work only by probe); a server-side test of `fetchImage` would pin Finding 1's fix.

## What I looked for and ruled out

Sub-par code: I checked that the `fetchAllowed` extraction keeps every check of the old `fetchForTool`: the protocol check, the per-hop allowlist check, manual redirects with the 5-hop cap, the secret header going only to its own host, and errors scrubbed of secrets. The old non-ok-status and parse paths moved unchanged (`current` became `final`, the same URL). The probe confirmed redirect-off-list, off-list and non-URL refusals on the image route, and that the keyed host received its secret and only it. `seriesOf` keeps labels aligned with values when non-numeric values are skipped. Bindings to missing paths draw a zero-point chart without throwing. The button sends its label, an empty label is a no-op through `send`'s trim, and `type="button"` and `preventDefault` stop native submission.

Design drift: PageView still draws one element per component, keyed by id and resolved through `resolveBindings`. `send` is threaded as a prop, with no action vocabulary added to the page spec or catalog (D13). Pages still request only their own origin. src/page stays renderer-independent (`imageThroughServer` is a plain string function). No second renderer was added, docs/ is untouched, and only the two named tests were promoted.

Spec signal: none found. The cited scenarios and D8 and D13 fit the code as built, and the refuse-or-queue choice the seam note asked for is decided in code as refuse (Finding 4 concerns only its feedback).
