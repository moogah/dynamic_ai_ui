---
task_name: owner-server-entry
merge_commit: 328e16e8039530618654cde8fc9c5ea7b9413969
reviewed_at: 2026-10-29T00:44:33Z
finding_count: 3
clean_review: false
---

## Summary

I reviewed the diff (`.gitignore`, `allowlist.json`, `index.html`, `package.json` scripts, `server/config.ts`, `server/main.ts`, `server/node.ts`, `src/main.tsx`, `vite.config.ts`) against the task brief, seam/allowlist, seam/model-relay, D1, D7, D8 and D10, and data-fetch § Secrets added by the server. The test command gives 23 tests and 0 failures. The diff touches nothing under `test/` or `docs/`, and no `it.fails` is left in `test/`. `npx tsc --noEmit` is clean. I built and ran the site from a `git archive` copy in scratch, so the checkout was left untouched. `npm run build` produced `dist/` and `dist-server/main.js`. With a fake key, `npm start` served the page, its asset and the `/api/` routes. The relay reached the Messages API and returned only the model's 401 body. Path traversal (`/../`, `%2e%2e`) got a 404. A keyed host whose variable is unset was left out with a warning. `vite` dev served the page and routed `/api/messages` and `/api/fetch` to the handler. There are three issues:
- The server's own transport refuses every IPv4 address. This is a defect in code the diff calls, and it means neither shipped Open-Meteo host can be fetched from the running site.
- One GET with a malformed percent escape crashes `npm start`.
- One request with a malformed Host header crashes `npm start`.

## Findings

### Finding 1: The server's own transport refuses every IPv4 address, so the running site can fetch from none of the shipped hosts

- kind: issue
- severity: high
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:188
  - file: allowlist.json:4
  - file: server/main.ts:38
- evidence: |
  `notPublic` adds the IPv6 rule `["::ffff:0:0", 96]`. Node's `BlockList` checks an IPv4 address against IPv6 rules through its mapped form `::ffff:a.b.c.d`. As a result, that one rule matches every IPv4 address. I checked this by loading the merge commit's `server/fetchTool.ts` with `node --experimental-strip-types`. `isPublicAddress` returned false for 8.8.8.8, 1.1.1.1 and 167.114.211.86, and true only for an IPv6 address. `publicOnlyFetch("https://api.open-meteo.com/v1/forecast?...")` was refused with "api.open-meteo.com resolves to 167.114.211.86, which is not a public address". Through the dev server, `POST /api/fetch` with an Open-Meteo forecast URL returned `{"ok":false,"error":"fetching api.open-meteo.com failed: api.open-meteo.com resolves to 167.114.211.86, which is not a public address"}`. `publicLookup` also refuses a host when any of its addresses fails the check, so a host that has both IPv4 and IPv6 addresses is refused as well. This applies to all three shipped hosts: api.open-meteo.com, geocoding-api.open-meteo.com and api.football-data.org, which resolves to 185.250.250.33. The site this task makes runnable cannot run data-fetch § Fetch then display against any real host (R2). The suite misses it because every test passes `fetchData` (`test/support/site.ts:300`), so no test runs the real transport. The task's manual check covers a model turn and no fetch. The defect is in the fetch-tool task's code, but this task is where it first matters to a user.
  Rewritten as Node commands (`isPublicAddress` and `publicOnlyFetch` are exported by the merge commit's `server/fetchTool.ts`):
    node -e 'const {BlockList}=require("net");const b=new BlockList();b.addSubnet("::ffff:0:0",96,"ipv6");console.log(b.check("8.8.8.8","ipv4"))'  -> true
    node --experimental-strip-types -e 'import("./server/fetchTool.ts").then(m=>console.log(m.isPublicAddress("8.8.8.8")))'  -> false
  Removing the rule keeps v4-mapped addresses covered, because `BlockList` maps them back onto the IPv4 rules: with only `127.0.0.0/8` added, `check("::ffff:127.0.0.1","ipv6")` returns true.
- recommended_action:
  kind: inline-fix
  detail: Drop the `::ffff:0:0/96` rule, since mapped addresses are already checked by the IPv4 rules. Add a test that calls `isPublicAddress` on a public IPv4 and a public IPv6 address and on mapped loopback, and run one real fetch of api.open-meteo.com as the manual check.

### Finding 2: One GET with a malformed percent escape crashes the server

- kind: issue
- severity: high
- direction: sub-par-code
- locations:
  - file: server/main.ts:26
  - file: server/main.ts:44
- evidence: |
  `staticFile` calls `decodeURIComponent(pathname)` before its `try`. On a malformed escape this throws a URIError and the returned promise rejects. The caller, `void staticFile(pathname).then(...)`, has no rejection handler. Node 22 treats an unhandled rejection as fatal, so the process exits. In the probe, `npm start` (`node dist-server/main.js`, PORT=0) was running, and `curl localhost:$P/%E0%A4%A` got no response. The server log ended with `URIError: URI malformed at decodeURIComponent ... at staticFile (dist-server/main.js:708)` and `Node.js v22.22.0`, and the process was gone. A single unauthenticated request of a few bytes, or a mistyped link, stops the owner's site for every visitor, and nothing restarts it.
- recommended_action:
  kind: inline-fix
  detail: Move the decode inside the `try` (a malformed path is a 404) and add a `.catch` on the `staticFile` call that answers 500, so no rejection is left unhandled.

### Finding 3: One request with a malformed Host header crashes the server

- kind: issue
- severity: high
- direction: sub-par-code
- locations:
  - file: server/main.ts:40
  - file: server/main.ts:41
- evidence: |
  The request listener builds `origin` from the raw `Host` header and calls `new URL(req.url ?? "/", origin)` synchronously, with no `try`. A Host the URL parser rejects throws inside the `request` event, and Node exits on the uncaught exception. In the probe, a fresh `npm start` received `curl -H 'Host: a b' localhost:$P/`. The log showed `TypeError: Invalid URL ... code: 'ERR_INVALID_URL', input: '/', base: 'http://a b'` and the process exited. `toRequest` in `server/node.ts` makes the same URL inside `serveWith`'s `try`, so that call answers 500 and does not crash. The top-level parse is the only one left unguarded. The effect is the same as Finding 2: anyone who can reach the port can stop the site.
- recommended_action:
  kind: inline-fix
  detail: Parse the path without trusting Host, for example `new URL(req.url ?? "/", "http://localhost")`, or catch the parse error and answer 400. Pass the same fixed origin to `serveWith`.

## Thoughts

- thought: `vite.config.ts` hard-codes `"/api/"` where `server/main.ts` uses `SERVER_PREFIX` from `server/config.ts`. The two copies agree today.
- thought: The built page is served without a Content-Security-Policy. The seam/allowlist rule "the page loads nothing from another host" is therefore enforced only by the renderer's code. A `default-src 'self'` header from `server/main.ts` would enforce it in the browser.
- thought: The dev handler is loaded once, on the first `/api/` request. Edits to `allowlist.json`, the environment or `server/*.ts` take effect only after restarting `vite`.
- thought: In `serveWith`, the `catch` calls `send` again. If the first `send` ever fails after `writeHead`, the second call throws `ERR_HTTP_HEADERS_SENT` and leaves an unhandled rejection. No handler response today can fail at that point, because every body is already in memory.
- thought: `toRequest` buffers the whole request body with no limit. Cost and abuse controls are an intent non-goal.

## What I looked for and ruled out

Sub-par code: I checked how `server/main.ts` confines static files. `normalize(join(dist, …))` with a `dist + "/"` prefix check, plus `isFile`, blocked `/../package.json`, `%2e%2e`, directories and NUL. HEAD and POST on static paths behave correctly. A chunked POST body reaches the handler. `resolveAllowlist` rejects entries that have no `host` or a malformed `secret`, and it drops a keyed host whose variable is empty with a warning, so the host is refused and never called without its key. `loadHandler` fails loudly when `ANTHROPIC_API_KEY` is unset. In dev, a failed load is reported as a 500 JSON error and retried on the next request. The SSR build bundles the `src/` modules the server imports, so `npm start` needs nothing beyond Node built-ins.

Design drift: The Claude key and data secrets are read only in `server/config.ts`. Nothing under `src/` reads `process.env` or `import.meta.env`, no `src/` module imports from `server/`, and the built bundle contains neither variable name nor `x-api-key`. The relay still fixes the model, system prompt and tools inside `createApp`, as D7 requires. The allowlist file matches D8: each entry has a host and, for a keyed host, the header its secret goes in and the variable that holds it. It matches D10: a keyless Open-Meteo host plus a keyed api.football-data.org whose free key goes in the `X-Auth-Token` header, so no query-string form is needed. The extra keyless geocoding host does not conflict with D10. The diff touches neither `test/` nor `docs/`, and no pending test was promoted or changed. A dev middleware in place of a proxy still matches D1's "Vite's dev server sits in front of it".

Spec signal: I found no friction in the seams. Finding 1 shows that the seam/allowlist rows' tests (`test/data-fetch.test.ts`) never exercise the "own transport refuses at connection time" clause, because the harness always replaces the transport. The fix belongs in a test of `isPublicAddress`, and the seam row needs no change.

Probes ran from a `git archive` copy in the scratch directory, with `node_modules` symlinked. Every server I started was stopped, and the scratch directory was deleted afterwards.
