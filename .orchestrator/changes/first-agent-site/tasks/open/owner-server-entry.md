---
task_name: owner-server-entry
description: "The runnable site: the Node entry, the Vite build and dev setup, and the shipped allowlist file with one keyless and one keyed source"
change: first-agent-site
status: ready
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

## Observations

## Discoveries
