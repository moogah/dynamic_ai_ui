// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

const mod = () => import(/* @vite-ignore */ new URL("./store.ts", import.meta.url).href);
const spec = () => import(/* @vite-ignore */ new URL("../shared/pagespec.ts", import.meta.url).href);

describe("seam/page-store", () => {
  it.fails("a store created on a reload holds the skeleton and nothing is read from or written to browser storage (Scenario: page-spec § A reload returns the skeleton; seam/page-store)", async () => {
    const { createPageStore } = await mod();
    const { skeleton } = await spec();
    const first = createPageStore();
    first.beginTurn();
    first.apply({ op: "upsert", id: "c1", type: "card", props: { title: "x" } });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    const afterReload = createPageStore();
    expect(afterReload.getSpec()).toEqual(skeleton());
  });

  it.fails("undo restores the page spec as it was before the last turn, one step only (Scenario: page-spec § Undo restores the page before the last turn; seam/page-store)", async () => {
    const { createPageStore } = await mod();
    const { findComponent } = await spec();
    const store = createPageStore();
    store.beginTurn();
    store.apply({ op: "upsert", id: "t1", type: "table", props: { columns: ["a"], rows: [] } });
    store.beginTurn();
    store.apply({ op: "remove", id: "t1" });
    expect(findComponent(store.getSpec(), "t1")).toBeUndefined();
    store.undo();
    expect(findComponent(store.getSpec(), "t1")).toBeDefined();
    store.undo();
    expect(findComponent(store.getSpec(), "t1")).toBeDefined();
  });

  it.fails("notifies subscribers on every accepted edit and not on a rejected one (seam/page-store)", async () => {
    const { createPageStore } = await mod();
    const store = createPageStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.apply({ op: "upsert", id: "h1", type: "heading", props: { text: "Hi" } });
    store.apply({ op: "upsert", id: "m1", type: "map", props: {} });
    expect(calls).toBe(1);
  });
});
