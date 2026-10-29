// The agent loop (seam/turn, seam/loop-state; design D12): hand-written over the Messages API,
// in the browser, behind the owner's relay. A turn runs from one visitor message until the
// model ends its reply: the loop sends the conversation through the server, runs every tool
// call of a reply and answers all of them in one message, failures as error results, and
// repeats. The loop is the only writer of its state. Stopping a turn (seam/stop, design D6)
// aborts its model request or tool run, answers the reply's unanswered tool calls with error
// results, and drops whatever arrives for the turn afterwards.
import { describePage } from "../page/snapshot";
import type { PageStore } from "../page/store";
import { isText, isToolUse, type ToolUseBlock, type ContentBlock, type MessageParam, type ModelReply, type ToolResultBlock } from "./messages";
import { isBusy, type LoopState } from "./states";
import { runTool, STOPPED_RESULT, type ToolContext } from "./tools";

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
  // Stops the running turn (seam/stop): its edits stay, nothing arriving for it afterwards is
  // applied, every tool call stays answered, and the loop awaits the visitor. Nothing happens
  // between turns.
  stop(): void;
}

export type CallModel = (messages: MessageParam[], signal?: AbortSignal) => Promise<ModelReply>;

export interface LoopOptions {
  store: PageStore;
  callModel?: CallModel;
  fetchUrl?: ToolContext["fetchUrl"];
}

// The page's own origin only (design D2): the server relays to the Messages API.
export const RELAY_PATH = "/api/messages";

export async function callModelThroughServer(messages: MessageParam[], signal?: AbortSignal): Promise<ModelReply> {
  const response = await fetch(RELAY_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`the server answered ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as ModelReply;
}

export function createAgentLoop(options: LoopOptions): AgentLoop {
  const { store, callModel = callModelThroughServer } = options;
  const conversation: MessageParam[] = [];
  // The running turn: its abort controller and, while its tools run, the reply's tool calls
  // with the results they have so far, so a stop can answer the rest.
  type Turn = { controller: AbortController; running: { calls: ToolUseBlock[]; results: ToolResultBlock[] } | null };
  let turn: Turn | null = null;
  let snapshot: LoopSnapshot = { state: "idle", entries: [], error: null };
  const listeners = new Set<() => void>();

  const update = (change: Partial<LoopSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };
  const say = (entry: ChatEntry) => update({ entries: [...snapshot.entries, entry] });

  // Each visitor message carries the page as it stands (seam/page-snapshot, design D4), so
  // after undo or a stop the model reads the page as it is now.
  const visitorBlocks = (words: string): ContentBlock[] => [
    { type: "text", text: words },
    {
      type: "text",
      text: "The page as it stands (for reference; not written by the visitor):\n" + JSON.stringify(describePage(store.get())),
    },
  ];

  // A turn stopped while the model was answering ends on a user message (the visitor's, or the
  // last tool results); the next visitor message joins it, so the roles keep alternating.
  const addVisitorMessage = (words: string) => {
    const last = conversation[conversation.length - 1];
    if (last?.role === "user") last.content = [...last.content, ...visitorBlocks(words)];
    else conversation.push({ role: "user", content: visitorBlocks(words) });
  };

  async function send(message: string): Promise<void> {
    const words = message.trim();
    if (words === "" || isBusy(snapshot.state)) return;
    store.beginTurn();
    const current: Turn = { controller: new AbortController(), running: null };
    turn = current;
    const { signal } = current.controller;
    const toolContext: ToolContext = { store, fetchUrl: options.fetchUrl, signal };
    update({ state: "calling_model", error: null, entries: [...snapshot.entries, { role: "visitor", text: words }] });
    addVisitorMessage(words);
    try {
      for (;;) {
        const reply = await callModel(conversation, signal);
        // A reply arriving for a stopped turn is dropped (seam/stop).
        if (signal.aborted) return;
        const content: ContentBlock[] = Array.isArray(reply.content) ? reply.content : [];
        conversation.push({ role: "assistant", content });
        for (const block of content) if (isText(block) && block.text) say({ role: "assistant", text: block.text });
        const calls = content.filter(isToolUse);
        if (calls.length === 0) break;
        update({ state: "running_tools" });
        const results: ToolResultBlock[] = [];
        current.running = { calls, results };
        for (const call of calls) {
          const result = await runTool(call, toolContext);
          // stop() has answered this reply's calls already.
          if (signal.aborted) return;
          results.push(result);
          say({ role: "tool", text: `${call.name}: ${result.is_error ? "error, " : ""}${result.content}` });
        }
        current.running = null;
        conversation.push({ role: "user", content: results });
        update({ state: "calling_model" });
      }
      update({ state: "awaiting_visitor" });
    } catch (error) {
      if (signal.aborted) return;
      update({ state: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (turn === current) turn = null;
    }
  }

  function stop(): void {
    const current = turn;
    if (current === null || current.controller.signal.aborted) return;
    current.controller.abort();
    turn = null;
    if (current.running) {
      const { calls, results } = current.running;
      const answered = new Set(results.map((r) => r.tool_use_id));
      const unanswered = calls.filter((call) => !answered.has(call.id));
      const stopped = unanswered.map(
        (call): ToolResultBlock => ({ type: "tool_result", tool_use_id: call.id, content: STOPPED_RESULT, is_error: true }),
      );
      conversation.push({ role: "user", content: [...results, ...stopped] });
      for (const call of unanswered) say({ role: "tool", text: `${call.name}: stopped` });
    }
    say({ role: "tool", text: "Stopped by the visitor." });
    update({ state: "awaiting_visitor" });
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
    stop,
  };
}
