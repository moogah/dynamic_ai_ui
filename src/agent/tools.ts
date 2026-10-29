// The tool list (seam/tool-list): the one module defining the tools the model is offered, the
// page-spec tools and the fetch tool, with their names, descriptions and input schemas. The
// server sends exactly this list; the browser runs each call and builds each tool result here.
import { isPageToolName, pageToolDefinitions, runPageTool, type ToolDefinition } from "../page/tools";
import type { PageStore } from "../page/store";
import type { ToolResultBlock, ToolUseBlock } from "./messages";

export const FETCH_TOOL = "fetch_url";

// The fetch tool's run path (seam/fetch-result, design D3): the owner's server fetches from its
// allowlist; the whole response is kept in the page spec's data under the name the assistant
// gave, and the tool result is the view the model reads, cut to a size limit.
export const fetchToolDefinition: ToolDefinition = {
  name: FETCH_TOOL,
  description:
    "Fetches a URL through the owner's server, which allows only the hosts on its allowlist. The " +
    "whole response is stored in the page data under 'name', for components to bind to with " +
    '{"$data": "/<name>/<path>"}; you receive a view of it, trimmed if large.',
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch; its host must be on the allowlist." },
      name: { type: "string", description: "The name to store the response under in the page data." },
    },
    required: ["url", "name"],
  },
};

export const toolDefinitions: ToolDefinition[] = [...pageToolDefinitions, fetchToolDefinition];

// The page's own origin only (design D2): the server runs the fetch tool.
export const FETCH_PATH = "/api/fetch";

// The fetch tool's one result (seam/fetch-result): the whole response for the page spec's data,
// and the view the model reads; or a tool error.
export type FetchOutcome = { ok: true; name: string; data: unknown; view: string } | { ok: false; error: string };

// The signal is the turn's (seam/stop): stopping the turn aborts the request.
export type FetchUrl = (input: unknown, signal?: AbortSignal) => Promise<FetchOutcome>;

export async function fetchThroughServer(input: unknown, signal?: AbortSignal): Promise<FetchOutcome> {
  const response = await fetch(FETCH_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input ?? {}),
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`the server answered ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as FetchOutcome;
}

// What a tool run needs: the page store the tools edit through, and the way to the server's
// fetch tool (the server itself unless given), and the running turn's signal: once the turn is
// stopped, nothing a tool run brings back is applied (seam/stop, design D6).
export interface ToolContext {
  store: PageStore;
  fetchUrl?: FetchUrl;
  signal?: AbortSignal;
}

export const STOPPED_RESULT = "stopped by the visitor before this tool call finished; nothing it returned was applied";

// Runs one tool call and builds its result; a failure is an error result, never a throw.
export async function runTool(call: ToolUseBlock, context: ToolContext): Promise<ToolResultBlock> {
  const result = (content: string, isError = false): ToolResultBlock => ({
    type: "tool_result",
    tool_use_id: call.id,
    content,
    ...(isError ? { is_error: true } : {}),
  });
  try {
    if (isPageToolName(call.name)) {
      const outcome = runPageTool(context.store.get(), call.name, call.input);
      if (!outcome.ok) return result(outcome.error, true);
      context.store.apply(outcome.spec);
      return result(outcome.message);
    }
    if (call.name === FETCH_TOOL) {
      const outcome = await (context.fetchUrl ?? fetchThroughServer)(call.input, context.signal);
      if (context.signal?.aborted) return result(STOPPED_RESULT, true);
      if (!outcome.ok) return result(outcome.error, true);
      // The whole response goes into the page spec's data, as set_data would put it.
      const stored = runPageTool(context.store.get(), "set_data", { name: outcome.name, value: outcome.data });
      if (!stored.ok) return result(stored.error, true);
      context.store.apply(stored.spec);
      return result(outcome.view);
    }
    return result(`unknown tool '${call.name}'; the tools are ${toolDefinitions.map((t) => t.name).join(", ")}`, true);
  } catch (error) {
    if (context.signal?.aborted) return result(STOPPED_RESULT, true);
    return result(`${call.name} failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
