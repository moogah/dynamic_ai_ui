import { describe, expect, it } from "vitest";

const mod = () => import("./loop");
const storeMod = () => import("./store");
const specMod = () => import("../shared/pagespec");

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const reply = (stop_reason: string, content: Block[]) => ({ stop_reason, content });

describe("seam/agent-loop", () => {
  it.fails("runs a tool call, returns the result to the model and ends on the model's reply (Scenario: agent-loop § A turn with a tool call; seam/agent-loop)", async () => {
    const { createAgentLoop } = await mod();
    const { createPageStore } = await storeMod();
    const { findComponent } = await specMod();
    const store = createPageStore();
    const seen: unknown[] = [];
    const replies = [
      reply("tool_use", [{ type: "tool_use", id: "t1", name: "upsert_component", input: { id: "h1", type: "heading", props: { text: "Hello" } } }]),
      reply("end_turn", [{ type: "text", text: "Done." }]),
    ];
    const loop = createAgentLoop({
      callModel: async (messages: unknown) => {
        seen.push(JSON.parse(JSON.stringify(messages)));
        return replies.shift()!;
      },
      tools: { upsert_component: (input: any) => store.apply({ op: "upsert", ...input }) },
      beforeTurn: () => store.beginTurn(),
    });
    const result = await loop.runTurn("add a heading that says Hello");
    expect(findComponent(store.getSpec(), "h1")).toBeDefined();
    expect(JSON.stringify(seen[1])).toContain("t1"); // the tool result reached the model
    expect(JSON.stringify(result.reply)).toContain("Done.");
  });

  it.fails("reports calling-model, then running-tools while a tool runs, then awaiting-visitor (Scenario: agent-loop § The visitor sees progress; seam/agent-loop)", async () => {
    const { createAgentLoop } = await mod();
    const states: string[] = [];
    const replies = [
      reply("tool_use", [{ type: "tool_use", id: "t1", name: "fetch_url", input: { url: "https://api.example.com/x" } }]),
      reply("end_turn", [{ type: "text", text: "ok" }]),
    ];
    const loop = createAgentLoop({
      callModel: async () => replies.shift()!,
      tools: { fetch_url: async () => ({ ok: true, body: "{}" }) },
      onState: (s: string) => states.push(s),
    });
    await loop.runTurn("fetch it");
    const order = states.filter((s, i) => s !== states[i - 1]);
    expect(order).toEqual(["calling-model", "running-tools", "calling-model", "awaiting-visitor"]);
  });

  it.fails("ends in the error state when the model call fails (seam/agent-loop)", async () => {
    const { createAgentLoop } = await mod();
    const states: string[] = [];
    const loop = createAgentLoop({
      callModel: async () => {
        throw new Error("boom");
      },
      tools: {},
      onState: (s: string) => states.push(s),
    });
    await loop.runTurn("hi").catch(() => undefined);
    expect(states.at(-1)).toBe("error");
  });

  it.fails("stopping a turn keeps the edits already made and undo removes them (Scenario: agent-loop § Stopping keeps edits already made; seam/agent-loop)", async () => {
    const { createAgentLoop } = await mod();
    const { createPageStore } = await storeMod();
    const { findComponent } = await specMod();
    const store = createPageStore();
    const controller = new AbortController();
    const states: string[] = [];
    let calls = 0;
    const loop = createAgentLoop({
      callModel: async () => {
        calls++;
        return reply("tool_use", [{ type: "tool_use", id: `t${calls}`, name: "upsert_component", input: { id: "c1", type: "card", props: { title: "x" } } }]);
      },
      tools: {
        upsert_component: (input: any) => {
          const r = store.apply({ op: "upsert", ...input });
          controller.abort();
          return r;
        },
      },
      beforeTurn: () => store.beginTurn(),
      onState: (s: string) => states.push(s),
    });
    await loop.runTurn("add a card", { signal: controller.signal }).catch(() => undefined);
    expect(calls).toBe(1);
    expect(states.at(-1)).toBe("awaiting-visitor");
    expect(findComponent(store.getSpec(), "c1")).toBeDefined();
    store.undo();
    expect(findComponent(store.getSpec(), "c1")).toBeUndefined();
  });
});
