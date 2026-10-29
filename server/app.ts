// The owner's server (seam/model-relay, design D7, D12): a fetch-style request handler made from
// its configuration. It alone holds the Claude API key. It sends the page's conversation to the
// Messages API with its own model, system prompt and tool list, returns only the model's reply,
// and keeps nothing between requests. Whatever else the page sends is ignored.
//
// It also runs the fetch tool for the page (seam/allowlist, seam/fetch-result, design D3, D8):
// the page posts a fetch_url input to FETCH_PATH and gets back the whole response and the view
// the model reads, or a tool error; server/fetchTool.ts does the fetching.
import { FETCH_PATH, toolDefinitions } from "../src/agent/tools";
import { IMAGE_PATH } from "../src/page/catalog";
import { SKELETON_IDS } from "../src/page/spec";
import { fetchForTool, fetchImage, type AllowlistEntry, type FetchLike } from "./fetchTool";

export type { AllowlistEntry, FetchLike };

export interface AppOptions {
  anthropicApiKey: string;
  allowlist: AllowlistEntry[];
  // The server's way to the Messages API.
  fetchModel: FetchLike;
  // The server's way to the data hosts; its own connection-checked transport when left out.
  fetchData?: FetchLike;
}

export type Handler = (request: Request) => Promise<Response>;

export const MESSAGES_PATH = "/api/messages";
export const MESSAGES_API = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

// Design D7: the model is one constant here.
export const MODEL = "claude-sonnet-5-5";
export const MAX_TOKENS = 16000;

export const SYSTEM_PROMPT = [
  "You are the assistant of a web page that you reshape in conversation with its visitor. The page",
  "is drawn from a page spec: a flat set of components, each with an id, a type from the component",
  "catalog, a parent container and props, plus named data that props can bind to. You edit the page",
  "spec only through the tools put_components, remove_component and set_data; you never write HTML,",
  "markup or scripts, and every prop is shown as plain text.",
  "",
  `The page starts as a skeleton: the containers '${SKELETON_IDS.join("' and '")}'. Put what the visitor`,
  "asks for inside 'content' unless they want something in the header. Choose short, stable ids and",
  "reuse an id to change a component in place.",
  "",
  "Each visitor message ends with a description of the page as it stands, including every component",
  "and the shape of each data entry. Trust it over your memory: the visitor can undo your last turn",
  "or stop it, and the page then differs from what you last did. Data is described by shape, not in",
  "full; bind components to it by path rather than copying values.",
  "",
  "To show data from the web, call fetch_url with a URL on an allowlisted host and a name; the",
  "response is stored in the page data under that name and you receive a view of it. Then bind a",
  "component (a chart, table, list or tile) to the data by path.",
  "",
  "Keep replies short: say what you changed, and ask when the request is ambiguous.",
].join("\n");

export function createApp(options: AppOptions): Handler {
  const { anthropicApiKey, fetchModel, allowlist, fetchData } = options;

  async function fetchTool(request: Request): Promise<Response> {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return problem(400, "the request body must be JSON");
    }
    // A tool error is an answer too: the page turns it into the tool result.
    return Response.json(await fetchForTool(input, { allowlist, fetchData }));
  }

  async function image(request: Request): Promise<Response> {
    const src = new URL(request.url).searchParams.get("src");
    if (!src) return problem(400, "an image request needs a 'src'");
    const outcome = await fetchImage(src, { allowlist, fetchData });
    if (!outcome.ok) return problem(403, outcome.error);
    return new Response(outcome.bytes, {
      headers: { "content-type": outcome.type, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "cache-control": "private, max-age=300" },
    });
  }

  async function relay(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return problem(400, "the request body must be JSON");
    }
    const messages = (body as { messages?: unknown } | null)?.messages;
    if (!Array.isArray(messages)) return problem(400, "the request body must hold a 'messages' array");

    // Only the conversation comes from the page: model, system prompt and tools are fixed here.
    const upstream = await fetchModel(MESSAGES_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, tools: toolDefinitions, messages }),
    });
    // Only the model's reply goes back, with its status; the headers of the Messages API
    // (request ids, rate limits) stay on the server.
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "content-type": "application/json" } });
  }

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === MESSAGES_PATH) {
      if (request.method !== "POST") return problem(405, "POST only");
      return relay(request);
    }
    if (pathname === FETCH_PATH) {
      if (request.method !== "POST") return problem(405, "POST only");
      return fetchTool(request);
    }
    if (pathname === IMAGE_PATH) {
      if (request.method !== "GET") return problem(405, "GET only");
      return image(request);
    }
    return problem(404, `nothing at ${pathname}`);
  };
}

function problem(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
