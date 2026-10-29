// The tool list (seam/tool-list): the one module defining the tools the model is offered, the
// page-spec tools and the fetch tool, with their names, descriptions and input schemas. The
// server sends exactly this list; the browser runs each call and builds each tool result here.
import { isPageToolName, pageToolDefinitions, runPageTool, type ToolDefinition } from "../page/tools";
import type { PageStore } from "../page/store";
import type { ToolResultBlock, ToolUseBlock } from "./messages";

export const FETCH_TOOL = "fetch_url";

// The fetch tool's definition is here so the server's list is final; its run path, the
// server's allowlisted fetch and the data it leaves in the page spec, is seam/fetch-result's.
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

// What a tool run needs: the page store the page-spec tools edit through, and the fetch tool's
// run path once it exists (seam/fetch-result); without it fetch_url answers with an error.
export interface ToolContext {
  store: PageStore;
  fetchUrl?: (input: unknown, store: PageStore) => Promise<ToolResultBlock["content"]>;
}

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
      if (!context.fetchUrl) return result(`${FETCH_TOOL} is not available on this page yet`, true);
      return result(await context.fetchUrl(call.input, context.store));
    }
    return result(`unknown tool '${call.name}'; the tools are ${toolDefinitions.map((t) => t.name).join(", ")}`, true);
  } catch (error) {
    return result(`${call.name} failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
