// The owner's configuration, read at start (design D8, D10): the allowlist file and the
// environment. Each allowlist entry is a host and, for a keyed host, the request header its
// secret goes in and the environment variable that holds it; the secret is resolved here and
// handed to createApp, and never reaches the built page.
import { readFileSync } from "node:fs";
import { createApp, type AllowlistEntry, type FetchLike, type Handler } from "./app";

export const ALLOWLIST_FILE = "allowlist.json";
export const CLAUDE_KEY_VARIABLE = "ANTHROPIC_API_KEY";

// The page's requests that the handler answers; everything else is the built page.
export const SERVER_PREFIX = "/api/";

interface FileEntry {
  host: string;
  secret?: { header: string; env: string };
}

type Env = Record<string, string | undefined>;

export interface Resolved {
  allowlist: AllowlistEntry[];
  // Notes for the owner, e.g. a keyed host left out because its variable is unset.
  warnings: string[];
}

// The allowlist file's entries with their secrets taken from the environment. A keyed host
// whose variable is unset is left out, so it is refused rather than called without its key.
export function resolveAllowlist(text: string, env: Env): Resolved {
  const parsed = JSON.parse(text) as { hosts?: unknown };
  if (!Array.isArray(parsed.hosts)) throw new Error(`${ALLOWLIST_FILE} must hold a 'hosts' array`);
  const allowlist: AllowlistEntry[] = [];
  const warnings: string[] = [];
  for (const raw of parsed.hosts as FileEntry[]) {
    if (typeof raw?.host !== "string" || raw.host === "") throw new Error(`each entry in ${ALLOWLIST_FILE} needs a 'host'`);
    if (!raw.secret) {
      allowlist.push({ host: raw.host });
      continue;
    }
    const { header, env: variable } = raw.secret;
    if (typeof header !== "string" || typeof variable !== "string") {
      throw new Error(`the secret of ${raw.host} in ${ALLOWLIST_FILE} needs a 'header' and an 'env'`);
    }
    const value = env[variable];
    if (!value) {
      warnings.push(`${raw.host} is left off the allowlist: set ${variable} to its key`);
      continue;
    }
    allowlist.push({ host: raw.host, secret: { header, value } });
  }
  return { allowlist, warnings };
}

// The server's handler made from the allowlist file in `root` and the environment.
export function loadHandler(root: string, env: Env = process.env, fetchModel: FetchLike = fetch): Handler {
  const anthropicApiKey = env[CLAUDE_KEY_VARIABLE];
  if (!anthropicApiKey) throw new Error(`set ${CLAUDE_KEY_VARIABLE} to the Claude API key`);
  const { allowlist, warnings } = resolveAllowlist(readFileSync(`${root}/${ALLOWLIST_FILE}`, "utf8"), env);
  for (const warning of warnings) console.warn(warning);
  console.log(`allowlist: ${allowlist.map((e) => e.host).join(", ") || "(empty)"}`);
  return createApp({ anthropicApiKey, allowlist, fetchModel });
}
