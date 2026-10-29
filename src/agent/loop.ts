// The agent loop (seam/turn, seam/loop-state; design D12): hand-written over the Messages API,
// in the browser, behind the owner's relay. A turn runs from one visitor message until the
// model ends its reply: the loop sends the conversation through the server, runs every tool
// call of a reply and answers all of them in one message, failures as error results, and
// repeats. The loop is the only writer of its state.
import { describePage } from "../page/snapshot";
import type { PageStore } from "../page/store";
import { isText, isToolUse, type ContentBlock, type MessageParam, type ModelReply, type ToolResultBlock } from "./messages";
import { isBusy, type LoopState } from "./states";
import { runTool, type ToolContext } from "./tools";

export interface ChatEntry {
  role: "visitor" | "assistant" | "tool";
  text: string;
}

export interface LoopSnapshot {
  state: LoopState;
  // What the chat shows: the visitor's words, the assistant's replies and one line per tool call.
  entries: readonly ChatEntry[];
  // What went wrong, in the error state.
  error: string | null;
}

export interface AgentLoop {
  readonly state: LoopState;
  snapshot(): LoopSnapshot;
  subscribe(listener: () => void): () => void;
  // Starts a turn with a visitor message; resolves when the turn ends. Nothing happens while a
  // turn runs.
  send(message: string): Promise<void>;
  // Stopping a turn is seam/stop's (task stop-and-undo); until then this does nothing.
  stop(): void;
}

export type CallModel = (messages: MessageParam[]) => Promise<ModelReply>;

export interface LoopOptions {
  store: PageStore;
  callModel?: CallModel;
  fetchUrl?: ToolContext["fetchUrl"];
}

// The page's own origin only (design D2): the server relays to the Messages API.
export const RELAY_PATH = "/api/messages";

export async function callModelThroughServer(messages: MessageParam[]): Promise<ModelReply> {
  const response = await fetch(RELAY_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`the server answered ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as ModelReply;
}

export function createAgentLoop(options: LoopOptions): AgentLoop {
  const { store, callModel = callModelThroughServer } = options;
  const toolContext: ToolContext = { store, fetchUrl: options.fetchUrl };
  const conversation: MessageParam[] = [];
  let snapshot: LoopSnapshot = { state: "idle", entries: [], error: null };
  const listeners = new Set<() => void>();

  const update = (change: Partial<LoopSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };
  const say = (entry: ChatEntry) => update({ entries: [...snapshot.entries, entry] });

  // Each visitor message carries the page as it stands (seam/page-snapshot, design D4).
  const visitorMessage = (words: string): MessageParam => ({
    role: "user",
    content: [
      { type: "text", text: words },
      {
        type: "text",
        text: "The page as it stands (for reference; not written by the visitor):\n" + JSON.stringify(describePage(store.get())),
      },
    ],
  });

  async function send(message: string): Promise<void> {
    const words = message.trim();
    if (words === "" || isBusy(snapshot.state)) return;
    store.beginTurn();
    update({ state: "calling_model", error: null, entries: [...snapshot.entries, { role: "visitor", text: words }] });
    conversation.push(visitorMessage(words));
    try {
      for (;;) {
        const reply = await callModel(conversation);
        const content: ContentBlock[] = Array.isArray(reply.content) ? reply.content : [];
        conversation.push({ role: "assistant", content });
        for (const block of content) if (isText(block) && block.text) say({ role: "assistant", text: block.text });
        const calls = content.filter(isToolUse);
        if (calls.length === 0) break;
        update({ state: "running_tools" });
        const results: ToolResultBlock[] = [];
        for (const call of calls) {
          const result = await runTool(call, toolContext);
          results.push(result);
          say({ role: "tool", text: `${call.name}: ${result.is_error ? "error, " : ""}${result.content}` });
        }
        conversation.push({ role: "user", content: results });
        update({ state: "calling_model" });
      }
      update({ state: "awaiting_visitor" });
    } catch (error) {
      update({ state: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    get state() {
      return snapshot.state;
    },
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    stop() {},
  };
}
