# Brief: Reviewer, task owner-server-entry (change first-agent-site, cycle cycle-1793231989)

This diff is up for review on task owner-server-entry. Read your role description first: `/root/.claude/skills/orchestrate/roles/reviewer.md` (mindset, three directions, probes, output contract). You are author-blind: review only the sources listed here. Do not look for or read any report, `## Observations` or `## Discoveries` section, or anything written by whoever did the work; do not read the task file under `.orchestrator/` in the main checkout (the task brief is embedded below).

## Where things are

- Your checkout (clean, detached at the merge commit `328e16e8039530618654cde8fc9c5ea7b9413969`): `/home/user/dynamic_ai_ui/.worktrees/review-owner-server-entry-20261029`. Do not modify it; run the test command and probes read-only. The merge commit's first parent (`328e16e8039530618654cde8fc9c5ea7b9413969^1`) is the base.
- The diff to review: `git -C /home/user/dynamic_ai_ui/.worktrees/review-owner-server-entry-20261029 diff 328e16e8039530618654cde8fc9c5ea7b9413969^1..328e16e8039530618654cde8fc9c5ea7b9413969`
- Test command (run in your checkout, foreground, once): `npx vitest run --reporter=junit --passWithNoTests` (junit report to stdout; 23 tests, 0 failures expected). Node modules resolve from the parent directory.
- Design: `docs/changes/first-agent-site/design.org` in your checkout (decisions D1-D13 and the Seams table); specs `docs/specs/page-spec.org`, `agent-loop.org`, `data-fetch.org`; glossary `docs/glossary.org`; intent `docs/changes/first-agent-site/intent.org`.
- Your scratch directory (probes only, nothing in the repository; delete it when done): `/tmp/claude-0/-home-user-dynamic-ai-ui/83c9dc72-b79d-548e-93d1-78d71909ad0d/scratchpad/review-owner-server-entry/`
- Findings file you write: `/home/user/dynamic_ai_ui/.orchestrator/changes/first-agent-site/cycles/cycle-1793231989/reviews/owner-server-entry.md` (format in the role file's Output contract; frontmatter `task_name: owner-server-entry`, `merge_commit: 328e16e8039530618654cde8fc9c5ea7b9413969`).
- Tests under `test/` and the harness `test/support/site.ts` are the design round's; the diff promoted pending `it.fails` tests by dropping `.fails` (check each promoted test genuinely exercises the behaviour its scenario states, and that no other pending test was touched).
- Project standards: none beyond the role file. Project priors: none.
- Shared machine rules: no `git stash`, no `git worktree prune`/`gc`/`remove`, no GUI or interactive program, no fixed ports, stop only processes you started, no test run left in the background.

## Task brief (the task file, without its Observations and Discoveries sections)

---
task_name: owner-server-entry
description: "The runnable site: the Node entry, the Vite build and dev setup, and the shipped allowlist file with one keyless and one keyed source"
change: first-agent-site
status: (merged)
task_class: infrastructure
on_critical_path: false

cites_seams:
  - seam/allowlist
  - seam/model-relay
cites_scenarios: []

relations:
  blocked_by:
    - site-turn: { status: merged }
    - fetch-tool: { status: merged }
---

# owner-server-entry

## Summary

Make the site runnable for the owner (D1, D8, D10): a small Node entry that reads the allowlist file and the environment (the Claude key, each keyed host's secret), calls `createApp`, and serves the built page; Vite's dev server in front of it in development; the allowlist file the first build ships with Open-Meteo (no key) and one keyed service with a free key, chosen by the Implementor, its secret named by an environment variable.

## Cited seams

| seam/allowlist | The server requests only from allowlisted hosts, checked on the parsed URL before any request and again on every redirect, and its own transport refuses at connection time a host whose address is not public; a host's secret goes only on requests to that host and is absent from everything the server returns; the page loads nothing from another host. | =server/fetchTool.ts=: =fetchForTool=; =server/app.ts=: =createApp= | data-fetch § A host not on the list is refused; data-fetch § A redirect off the list is not followed | =test/data-fetch.test.ts= |

The file is the owner's data: each entry a host and, for a keyed host, where its secret goes and which environment variable holds it. If the chosen keyed service takes its key in the query string, add that form to the entry and to `fetchForTool`, and say so in Observations (D10). This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

| seam/model-relay | The server alone holds the Claude API key: it sends the page's conversation to the Messages API with its own model, system prompt and tool list, returns only the model's reply, and keeps nothing between requests. | =server/app.ts=: =createApp= | agent-loop § No key in the browser | =test/agent-loop.test.ts= |

The entry passes the key from the environment; it never reaches the built page. This row was written before the code existed; if implementation reveals it's wrong, push back in `## Discoveries`.

## Implementation steps

1. `server/main.ts` (or similar): read `allowlist.json` (or the file D8 names) and the environment, resolve secrets, build `createApp`, serve `dist/` and the handler on one port.
2. `vite.config.ts`: build the page; in dev, proxy the page's server paths to the handler.
3. `package.json` scripts `dev`, `build`, `start` with exact versions for any new dependency.
4. A README section is not asked; one comment in the allowlist file says how to add a source.
5. Manual check: with a real key set, `npm run build && npm start` serves the skeleton and a turn reaches the model; report what you ran.

## Verification

Run `npx vitest run --reporter=junit --passWithNoTests` and report the last 10 lines. Promote these pending tests by dropping `.fails` in the implementation commit; every other `it.fails` stays pending and green. A pending test outside this list that starts passing is promoted too and named in `## Observations`:
No pending test is promoted by this task; the suite stays green with every `it.fails` still pending. Also report the manual check named in the last step.

## Out-of-scope

- Deployment or hosting.
- Cost and abuse controls (intent non-goal).
- Any change to the scripted tests.


## Cited scenarios (text from docs/specs/ at the merge commit) and coverage rows


(none cited)

## Hand-back

Your last act is one line, at most 200 characters, nothing else, no paths: `reviewed owner-server-entry issues=<n> questions=<n> spec-signal=<n> thoughts=<n>`.
