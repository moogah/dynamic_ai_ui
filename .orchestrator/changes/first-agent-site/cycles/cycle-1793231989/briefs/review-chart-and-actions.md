# Brief: Reviewer, task chart-and-actions (change first-agent-site, cycle cycle-1793231989)

This diff is up for review on task chart-and-actions. Read your role description first: `/root/.claude/skills/orchestrate/roles/reviewer.md` (mindset, three directions, probes, output contract). You are author-blind: review only the sources listed here. Do not look for or read any report, `## Observations` or `## Discoveries` section, or anything written by whoever did the work; do not read the task file under `.orchestrator/` in the main checkout (the task brief is embedded below).

## Where things are

- Your checkout (clean, detached at the merge commit `1ab1993975df29b68b75e76e06c1f0f917605e09`): `/home/user/dynamic_ai_ui/.worktrees/review-chart-and-actions-20261029`. Do not modify it; run the test command and probes read-only. The merge commit's first parent (`1ab1993975df29b68b75e76e06c1f0f917605e09^1`) is the base.
- The diff to review: `git -C /home/user/dynamic_ai_ui/.worktrees/review-chart-and-actions-20261029 diff 1ab1993975df29b68b75e76e06c1f0f917605e09^1..1ab1993975df29b68b75e76e06c1f0f917605e09`
- Test command (run in your checkout, foreground, once): `npx vitest run --reporter=junit --passWithNoTests` (junit report to stdout; 23 tests, 0 failures expected). Node modules resolve from the parent directory.
- Design: `docs/changes/first-agent-site/design.org` in your checkout (decisions D1-D13 and the Seams table); specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; glossary `docs/glossary.org`; intent `docs/changes/first-agent-site/intent.org`.
- Your scratch directory (probes only, nothing in the repository; delete it when done): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/review-chart-and-actions/`
- Findings file you write: `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reviews/chart-and-actions.md` (format in the role file's Output contract; frontmatter `task_name: chart-and-actions`, `merge_commit: 1ab1993975df29b68b75e76e06c1f0f917605e09`).
- Tests under `test/` and the harness `test/support/site.ts` are the design round's; the diff promoted pending `it.fails` tests by dropping `.fails` (check each promoted test genuinely exercises the behaviour its scenario states, and that no other pending test was touched).
- Project standards: none beyond the role file. Project priors: none.
- Shared machine rules: no `git stash`, no `git worktree prune`/`gc`/`remove`, no GUI or interactive program, no fixed ports, stop only processes you started, no test run left in the background.

## Task brief (the task file, without its Observations and Discoveries sections)

---
task_name: chart-and-actions
description: "Draw chart, image, form and button: charts bound to fetched data, images through the server, buttons and forms sending a visitor message"
change: first-agent-site
status: (merged)
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


## Cited scenarios (text from docs/specs/ at the merge commit) and coverage rows

### data-fetch § Fetch then display
*** Scenario: Fetch then display
- *WHEN* the weather API is on the allowlist
- *AND* the visitor asks "show the weather for Lisbon as a chart"
- *THEN* the assistant fetches the forecast and a chart of it appears on the page

### page-spec § Data shown as a chart
*** Scenario: Data shown as a chart
- *WHEN* the page spec holds a series fetched from an API
- *AND* the assistant adds a line chart bound to that series
- *THEN* a line chart of the series is drawn

### page-spec § A button sends a visitor message
*** Scenario: A button sends a visitor message
- *WHEN* the assistant has put a button labelled "Show tomorrow" on the page
- *AND* the visitor presses it
- *THEN* the assistant receives "Show tomorrow" as a visitor message and a turn starts

| capability | scenario | status | citations |
|-
| data-fetch | Fetch then display | cited | test/data-fetch.test.ts:22 |
| page-spec | Data shown as a chart | cited | test/data-fetch.test.ts:22 |
| page-spec | A button sends a visitor message | cited | test/page-spec.test.ts:85 |

3 scenarios: 3 cited

## Hand-back

Your last act is one line, at most 200 characters, nothing else, no paths: `reviewed chart-and-actions issues=<n> questions=<n> spec-signal=<n> thoughts=<n>`.
