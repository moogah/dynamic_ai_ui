---
task_name: fetch-tool
merge_commit: 18cdfe1a59e72da471c19ab6391a04f763fb5fc1
reviewed_at: 2026-10-29T00:38:41Z
finding_count: 7
clean_review: false
---

## Summary

I reviewed the diff `18cdfe1^1..18cdfe1` (server/fetchTool.ts new, server/app.ts, src/agent/tools.ts, two test files) against the brief, seam/allowlist, seam/fetch-result, seam/tool-list, seam/loop-state, design D2/D3/D8/D10 and data-fetch.org. The suite is 23 tests, 0 failures. The seven promoted tests are the listed ones, no other pending test was touched, and each one exercises its scenario. I probed `fetchForTool` and `publicOnlyFetch` directly with Node 22's `--experimental-strip-types`, using a scripted transport, a real local server and the real DNS. The main finding is high severity: the server's own transport refuses every IPv4 address. The `::ffff:0:0/96` rule in its BlockList matches all IPv4 addresses, so the design's own weather host, api.open-meteo.com, cannot be fetched in production. Nothing in the suite catches this, because every test either scripts the hosts or targets localhost. The secret also leaks in two ways that the seam row rules out: (a) when a keyed host echoes it into a redirect URL, the URL reaches the model's view unscrubbed; (b) when a keyed URL is http (asked for directly or reached by a downgrade redirect), the secret goes out in cleartext. The smaller findings cover gaps in the scrubbing and the address list, no bound on response size or time, and 20,000-character tool lines in the chat. One note on process: a repository-wide grep for stale names (`grep -rn ... .`) matched lines under the checkout's committed `.orchestrator/` tree. That included site-turn's task file and lines of the fetch-tool brief text. I used none of it, and I read no Observations or Discoveries of this task.

## Findings

### Finding 1: The server's own transport refuses every IPv4 address, so the weather host cannot be fetched

- kind: issue
- severity: high
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:147
  - file: server/fetchTool.ts:158
- evidence: |
  `isPublicAddress("8.8.8.8")`, `("1.1.1.1")` and `("188.40.99.226")` all return false. Node's BlockList checks an IPv4 address against IPv6 subnet rules as an IPv4-mapped address, so the IPv6 rule `["::ffff:0:0", 96]` matches every IPv4 address. Probe: a BlockList holding only `::ffff:0:0/96` gives `check("8.8.8.8","ipv4") === true`. End to end: `fetchForTool({url:"https://api.open-meteo.com/v1/forecast?...",name:"lisbon"}, {allowlist:[{host:"api.open-meteo.com"}]})` with no `fetchData` returns `{"ok":false,"error":"fetching api.open-meteo.com failed: api.open-meteo.com resolves to 188.40.99.226, which is not a public address"}`. Here the host resolves to IPv4 addresses only, and `publicLookup` refuses a host if any one of its addresses is refused. So on the real server every fetch to an IPv4 or dual-stack host fails, and data-fetch § Fetch then display cannot work against D10's keyless source. The rule is also unnecessary: Node already matches mapped addresses against the IPv4 rules (`check("::ffff:127.0.0.1","ipv6")` is true with only `127.0.0.0/8` added). The suite misses this because no test sends a public address through the default transport. The one default-transport test only checks that localhost is refused.
- recommended_action:
  kind: inline-fix
  detail: Drop the `::ffff:0:0/96` rule, since BlockList already applies the IPv4 rules to mapped addresses. Add a unit check that a public IPv4 address and a public IPv6 address pass `isPublicAddress`, and that `::ffff:127.0.0.1` is still refused.

### Finding 2: A secret echoed into a redirect URL reaches the model's view unscrubbed

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:82
- evidence: |
  The view starts `Fetched ${current.href} ...`, and `current` is the last redirect target. Only the body is passed through `scrub`. Probe: the keyed host answers `/start` with `302 Location: /final?token=<x-api-key value>`. `fetchForTool` then returns `view: "Fetched https://api.keyed.example/final?token=k3y-SECRET-abc123 (status 200); ..."`. That text is the tool result the model reads, and it also goes to the browser. seam/allowlist says the secret "is absent from everything the server returns", and the task row adds "even when the host echoes them". (The error strings use only `current.hostname` or the original `url`, so they are clean.)
- recommended_action:
  kind: inline-fix
  detail: Scrub the whole view, including the href, and any error text that might carry a URL. Better still, scrub the complete outcome (view, error and serialized data) at one point before returning. Add a redirect-echo case to the secret test.

### Finding 3: The secret is sent over plain http, whether the URL asks for http or a redirect downgrades to it

- kind: issue
- severity: medium
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:53
  - file: server/fetchTool.ts:62
- evidence: |
  The allowlist matches on hostname only and accepts both `http:` and `https:`. `headers[entry.secret.header] = entry.secret.value` is set on every hop to the keyed host, whatever the scheme. Probes with a recording transport:
  - `fetch_url {url:"http://api.keyed.example/"}` sent `x-api-key: k3y-SECRET-abc123` to `http://api.keyed.example/`.
  - `https://api.keyed.example/` answering `301 Location: http://api.keyed.example/x` sent the secret on the second, cleartext hop as well.
  The model chooses the URL, and prompt-injected fetched data can steer it (D8, E3 § 3). So the owner's key can go out unencrypted to anyone on the path. That defeats "the key never reaches the model or the browser" in practice, since anyone on the path can read it.
- recommended_action:
  kind: inline-fix
  detail: Attach a secret only on `https:` requests. Refuse an http URL or http redirect for a keyed host with a tool error, rather than sending it without the key. Add a test case for each.

### Finding 4: The secret scrub misses JSON-escaped and other encoded echoes, and the decoded value reaches the page

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:105
- evidence: |
  `scrub` replaces only the raw secret and its `JSON.stringify` form, and it works on the raw body before `JSON.parse`. Probe: the body `{"k":"k3y-SECRET-abc123"}` with content-type application/json gives `data: {"k":"k3y-SECRET-abc123"}`. The browser receives that object, keeps it in the page spec's data and can draw it. Percent-encoded and base64 echoes also pass, though they are less direct. The seam row says "even when the host echoes them", and the code checks one textual form only.
- recommended_action:
  kind: inline-fix
  detail: Also scrub after parsing, by walking the parsed data's strings or by scrubbing `JSON.stringify(data)` and re-parsing. Consider the percent-encoded form too.

### Finding 5: The address list misses IPv6 ranges that are not public (IPv4-compatible ::/96, site-local fec0::/10)

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:145
- evidence: |
  `isPublicAddress("::7f00:1")` (that is, ::127.0.0.1, IPv4-compatible) and `isPublicAddress("fec0::1")` both return true. Only `::/128` is blocked, not the deprecated `::/96`. The deprecated site-local `fec0::/10` is absent. The seam requires refusing "a host whose address is not public". If an allowlisted name's DNS answers with one of these (DNS rebinding is the threat the connection-time check exists for), the address passes the check. Whether the connection then reaches a local service depends on the platform. I could not test that here because the machine has no IPv6 listen support (`listen ::` gives EAFNOSUPPORT).
- recommended_action:
  kind: inline-fix
  detail: Block `::/96` and `fec0::/10`. Consider an allow-only-global-unicast check (2000::/3, minus the special ranges) for IPv6, in place of a deny list.

### Finding 6: No bound on a fetched response's size or total duration

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: server/fetchTool.ts:211
  - file: server/fetchTool.ts:202
- evidence: |
  `publicOnlyFetch` buffers every chunk into memory with no cap. `fetchForTool` then calls `response.text()`, builds a JSON outcome holding the whole body, and the browser keeps all of it in the page spec. `timeout: TIMEOUT_MS` is the socket's idle timeout, so a host that sends a byte every 19 seconds keeps the fetch open with no end. The DNS lookup has no timeout either. Stop does nothing yet (seam/stop is a later task), so the visitor sits in "running tools" for as long as the host drips. An allowlisted host, compromised or just very large, can exhaust the server's memory. D3 limits only what the model reads, but that does not make unbounded server buffering intended.
- recommended_action:
  kind: follow-up-task
  detail: Cap the bytes read (refuse with a tool error naming the cap), and add an overall deadline, for example an AbortSignal timeout covering lookup, connect and body.

### Finding 7: The chat shows the model's full fetch view, up to about 20,000 characters, as one tool line

- kind: issue
- severity: low
- direction: sub-par-code
- locations:
  - file: src/agent/tools.ts:80
  - file: src/agent/loop.ts:102
- evidence: |
  `runTool` returns `outcome.view` (VIEW_LIMIT 20,000 characters plus a header) as the tool result's content. The loop writes `${call.name}: ${result.content}` into the chat. `App.tsx:53-55` draws it in full, so one fetch puts up to 20,000 characters of raw JSON in the visitor's chat. The loop's own contract says the chat shows "one line per tool call". The probe with a 25,000-character body gave a view of 20,172 characters. Before this diff no tool result was this large, so this diff is what makes the problem appear.
- recommended_action:
  kind: inline-fix
  detail: Have the chat line show a short summary of a fetch result (for example "fetch_url: stored 'lisbon' (N characters)"), not the model's view. This could be a separate short `summary` on the tool result, or the loop could cut what it shows.

## Thoughts

- thought: The name check (`non-empty, no '/'`) is copied in `fetchForTool` and `setData`. The copies agree today.
- thought: The harness's `"dispatcher" in init` branch in `test/support/site.ts` is now unused, because the transport uses node:http and not fetch with an undici dispatcher.
- thought: The allowlist matches hostnames only, so any port on an allowlisted host can be reached, and userinfo in the URL goes out as Basic auth through node:http. D8 defines entries as hosts, so this is as designed, but a port or scheme field may be wanted once keyed hosts exist.
- thought: Transport-failure errors ("fetching X failed: ...") do not name the allowed hosts, but refusals do. Implementation step 1 says errors should name them.

## What I looked for and ruled out

Sub-par code: the allowlist is checked on the parsed hostname before any request and again on every redirect hop. Off-list and cross-host redirects are refused, and the key goes only to the keyed host's hop (probe 6: the second hop to other.example carries no header). Case and trailing-dot hostnames are handled safely. More than 5 redirects stops. A 3xx without Location is an error. The trimmed note gives the total and the number left out (probe: "the response is 25000 characters; the last 5000 were left out"). A refused NotPublicAddressError is reported in place of the generic socket error. An IP-literal host is checked before connecting. The custom lookup returns all addresses when `all` is set, and every one is checked, so the connection uses only checked addresses. Error text from the transport is scrubbed.

Design drift: `fetchForTool` lives in server/fetchTool.ts and is routed by `createApp` at `/api/fetch` on the page's own origin (D2). `runTool` in src/agent/tools.ts keeps the whole response through the same `set_data` edit and returns only the view, so the next model request names the data by shape only (seam/page-snapshot). The tool list is unchanged and shared. "running tools" holds for the whole fetch (seam/loop-state). No docs were edited.

Tests: the seven listed tests were promoted and nothing else changed. The strengthened localhost test needs "not a public address", which only `NotPublicAddressError` produces, so it would fail without the connection-time check. It cannot tell a check made at connection time from one made with a lookup before the request, but that is acceptable. The test gap in Finding 1 is that no test sends a public address through the default transport.

Spec signal: none found. The spec's requirements hold up once the defects above are fixed.
