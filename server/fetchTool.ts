// The fetch tool on the owner's server (seam/allowlist, seam/fetch-result; design D3, D8, D10).
// It requests only from allowlisted hosts, checked on the parsed URL before any request and
// again on every redirect, which it follows by hand. Its own transport refuses at connection
// time a host whose address is not public. A keyed host's secret goes, as its header, only on
// requests to that host, and is removed from everything returned. The result is the whole
// response, for the page spec's data, and the view the model reads, cut to a size limit.
// The page's images come through here too (fetchImage), under the same checks and transport.
import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { FetchOutcome } from "../src/agent/tools";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AllowlistEntry {
  host: string;
  secret?: { header: string; value: string };
}

export interface FetchToolOptions {
  allowlist: AllowlistEntry[];
  // The way to the data hosts; the connection-checked transport below when left out.
  fetchData?: FetchLike;
}

// What the model reads of a response, in characters; the whole response goes to the page.
export const VIEW_LIMIT = 20_000;
export const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;
const SECRET_PLACEHOLDER = "[secret removed]";

export async function fetchForTool(input: unknown, options: FetchToolOptions): Promise<FetchOutcome> {
  const given = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const { url, name } = given;
  if (typeof name !== "string" || name.trim() === "" || name.includes("/")) {
    return { ok: false, error: "fetch_url needs a non-empty 'name' without '/'" };
  }
  if (typeof url !== "string") return { ok: false, error: "fetch_url needs a 'url'" };

  const fetched = await fetchAllowed(url, options, "application/json, text/*;q=0.9, */*;q=0.5");
  if (!fetched.ok) return fetched;
  const { response, url: final, secrets } = fetched;
  try {
    const body = scrub(await response.text(), secrets);
    if (!response.ok) {
      return { ok: false, error: `${final.hostname} answered ${response.status}: ${cut(body, 2_000)}` };
    }
    const data = parse(body, response.headers.get("content-type") ?? "");
    // The address too: a host can echo the secret into a redirect it answers with.
    const view = scrub(
      `Fetched ${final.href} (status ${response.status}); the whole response is stored in the page ` +
        `data as '${name}'.\n` +
        cut(body, VIEW_LIMIT),
      secrets,
    );
    return { ok: true, name, data, view };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `fetching ${final.hostname} failed: ${scrub(reason, secrets)}` };
  }
}

export type Allowed = { ok: true; response: Response; url: URL; secrets: string[] } | { ok: false; error: string };

// One GET under the allowlist, shared by the fetch tool and the image route: the host is checked
// on the parsed URL before the request and again on every redirect, which is followed by hand;
// a keyed host's secret goes, as its header, only on requests to that host. The response is the
// last hop's, unread; `secrets` are what the caller removes from anything it returns.
export async function fetchAllowed(url: string, options: FetchToolOptions, accept: string): Promise<Allowed> {
  const allowlist = options.allowlist.map((entry) => ({ ...entry, host: entry.host.toLowerCase() }));
  const allowed = allowlist.length ? `the allowed hosts are ${allowlist.map((e) => e.host).join(", ")}` : "no hosts are allowed";
  const secrets = allowlist.flatMap((entry) => (entry.secret?.value ? [entry.secret.value] : []));
  const transport = options.fetchData ?? publicOnlyFetch;

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, error: `'${url}' is not a URL; ${allowed}` };
  }
  try {
    for (let hop = 0; ; hop++) {
      if (current.protocol !== "https:" && current.protocol !== "http:") {
        return { ok: false, error: `only http and https URLs can be fetched, not ${current.protocol}; ${allowed}` };
      }
      const entry = allowlist.find((e) => e.host === current.hostname);
      if (!entry) {
        const what = hop === 0 ? "" : `the request was redirected to ${current.hostname}, which was not followed: `;
        return { ok: false, error: `${what}${current.hostname} is not on the allowlist; ${allowed}` };
      }
      const headers: Record<string, string> = { accept };
      if (entry.secret) {
        // A secret never travels in clear text, whether the address asked for http or a redirect went down to it.
        if (current.protocol !== "https:") {
          return { ok: false, error: `${current.hostname} needs its key, which is sent over https only; ${current.href.split("?")[0]} is not https` };
        }
        headers[entry.secret.header] = entry.secret.value;
      }
      const response = await transport(current.href, { method: "GET", headers, redirect: "manual" });

      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        void response.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) return { ok: false, error: `more than ${MAX_REDIRECTS} redirects from ${url}` };
        try {
          current = new URL(response.headers.get("location")!, current);
        } catch {
          return { ok: false, error: `${current.hostname} redirected to an address that is not a URL` };
        }
        continue;
      }
      return { ok: true, response, url: current, secrets };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `fetching ${current.hostname} failed: ${scrub(reason, secrets)}` };
  }
}

// An image for the page (seam/allowlist, design D8): fetched under the same allowlist and
// transport as the fetch tool, returned only when it is a raster image that holds no secret.
// SVG is refused, since it is text the host writes and could carry anything.
export async function fetchImage(url: string, options: FetchToolOptions): Promise<{ ok: true; bytes: ArrayBuffer; type: string } | { ok: false; error: string }> {
  const fetched = await fetchAllowed(url, options, "image/*");
  if (!fetched.ok) return fetched;
  const { response, url: final, secrets } = fetched;
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!response.ok || !type.startsWith("image/") || type === "image/svg+xml") {
    void response.body?.cancel().catch(() => {});
    return { ok: false, error: `${final.hostname} did not answer with an image` };
  }
  try {
    const bytes = await response.arrayBuffer();
    const raw = Buffer.from(bytes);
    if (secrets.some((secret) => raw.includes(secret))) return { ok: false, error: `${final.hostname} answered with a secret in the image` };
    return { ok: true, bytes, type };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `fetching ${final.hostname} failed: ${scrub(reason, secrets)}` };
  }
}

// The text cut to `limit` characters, saying when cut that it was trimmed and how much was
// left out.
function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const left = text.length - limit;
  return `${text.slice(0, limit)}\n[trimmed: the response is ${text.length} characters; the last ${left} were left out]`;
}

// Every secret removed from a text, raw or as it appears inside a JSON string.
function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    for (const form of new Set([secret, JSON.stringify(secret).slice(1, -1)])) out = out.split(form).join(SECRET_PLACEHOLDER);
  }
  return out;
}

function parse(body: string, contentType: string): unknown {
  if (/json/i.test(contentType)) {
    try {
      return JSON.parse(body);
    } catch {
      // A body that says it is JSON and is not is kept as text.
    }
  }
  return body;
}

// ---------------------------------------------------------------------------------------
// The server's own transport: plain http(s) whose address lookup refuses, as the connection
// is made, any address that is not public. A host given as an address is checked directly,
// since no lookup happens for it.

// Two lists, because Node's BlockList matches an IPv4 address against an IPv6 subnet that
// covers the mapped range, which would refuse every IPv4 address. An IPv4-mapped IPv6
// address is refused whole, on the IPv6 list.
const notPublic4 = new BlockList();
const notPublic6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  notPublic4.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  notPublic6.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !notPublic4.check(address, "ipv4") : !notPublic6.check(address, "ipv6");
}

export class NotPublicAddressError extends Error {
  constructor(host: string, address: string) {
    super(host === address ? `${host} is not a public address` : `${host} resolves to ${address}, which is not a public address`);
    this.name = "NotPublicAddressError";
  }
}

type LookupCallback = (error: Error | null, address: string | LookupAddress[], family?: number) => void;

function publicLookup(hostname: string, options: unknown, callback: LookupCallback): void {
  const opts = (typeof options === "object" && options !== null ? options : {}) as Record<string, unknown>;
  dnsLookup(hostname, { family: (opts.family as number) ?? 0, hints: opts.hints as number, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const refused = addresses.find((a) => !isPublicAddress(a.address));
    if (refused) return callback(new NotPublicAddressError(hostname, refused.address), []);
    if (addresses.length === 0) return callback(new Error(`${hostname} has no address`), []);
    if (opts.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

export const publicOnlyFetch: FetchLike = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) && !isPublicAddress(bare)) return Promise.reject(new NotPublicAddressError(bare, bare));
  const send = url.protocol === "https:" ? httpsRequest : url.protocol === "http:" ? httpRequest : null;
  if (!send) return Promise.reject(new Error(`unsupported protocol ${url.protocol}`));
  const headers: Record<string, string> = { "accept-encoding": "identity" };
  new Headers(init.headers).forEach((value, key) => (headers[key] = value));

  return new Promise<Response>((resolve, reject) => {
    let refusal: Error | null = null;
    const req = send(
      url,
      {
        method: init.method ?? "GET",
        headers,
        agent: false,
        timeout: TIMEOUT_MS,
        lookup: (hostname: string, options: unknown, callback: LookupCallback) =>
          publicLookup(hostname, options, (error, address, family) => {
            if (error instanceof NotPublicAddressError) refusal = error;
            callback(error, address, family);
          }),
      } as never,
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
          const status = res.statusCode ?? 502;
          const nullBody = status === 204 || status === 205 || status === 304;
          resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`no answer from ${url.hostname} in ${TIMEOUT_MS / 1000} seconds`)));
    req.on("error", (error) => reject(refusal ?? error));
    req.end();
  });
};
