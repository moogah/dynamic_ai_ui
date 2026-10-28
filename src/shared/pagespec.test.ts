import { describe, expect, it } from "vitest";

// Pending (it.fails) until the behaviour exists; promotion is dropping `.fails`.
const mod = () => import("./pagespec");

describe("seam/page-spec-core", () => {
  it.fails("starts as a header area and an empty content area (Scenario: page-spec § The skeleton on first load; seam/page-spec-core)", async () => {
    const { skeleton, findComponent } = await mod();
    const spec = skeleton();
    expect(findComponent(spec, "header")).toBeDefined();
    const content = findComponent(spec, "content");
    expect(content).toBeDefined();
    expect(content!.children ?? []).toEqual([]);
  });

  it.fails("rejects a type outside the catalog, names the allowed types and leaves the spec unchanged (Scenario: page-spec § An unknown type is rejected; seam/page-spec-core)", async () => {
    const { skeleton, applyEdit, catalogTypes } = await mod();
    const before = skeleton();
    const snapshot = JSON.stringify(before);
    const result = applyEdit(before, { op: "upsert", id: "m1", type: "map", props: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const t of catalogTypes) expect(result.error).toContain(t);
    }
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it.fails("rejects properties that fail the type's validation without changing the spec (seam/page-spec-core)", async () => {
    const { skeleton, applyEdit } = await mod();
    const before = skeleton();
    const result = applyEdit(before, { op: "upsert", id: "h1", type: "heading", props: { text: 42 } });
    expect(result.ok).toBe(false);
  });

  it.fails("adds, replaces by id, removes and binds data without mutating the input (seam/page-spec-core)", async () => {
    const { skeleton, applyEdit, findComponent } = await mod();
    const s0 = skeleton();
    const a = applyEdit(s0, { op: "upsert", id: "h1", type: "heading", props: { text: "Hello" } });
    if (!a.ok) throw new Error(a.error);
    expect(findComponent(a.spec, "h1")).toBeDefined();
    expect(findComponent(s0, "h1")).toBeUndefined();
    const b = applyEdit(a.spec, { op: "upsert", id: "h1", type: "heading", props: { text: "Bye" } });
    if (!b.ok) throw new Error(b.error);
    expect(findComponent(b.spec, "h1")!.props.text).toBe("Bye");
    const c = applyEdit(b.spec, { op: "setData", key: "forecast", value: [1, 2, 3] });
    if (!c.ok) throw new Error(c.error);
    expect(c.spec.data.forecast).toEqual([1, 2, 3]);
    const d = applyEdit(c.spec, { op: "remove", id: "h1" });
    if (!d.ok) throw new Error(d.error);
    expect(findComponent(d.spec, "h1")).toBeUndefined();
  });

  it.fails("accepts every type of the first catalog (seam/page-spec-core)", async () => {
    const { catalogTypes } = await mod();
    const expected = ["heading", "text", "image", "card", "list", "row", "column", "table", "chart", "key-figure", "form"];
    for (const t of expected) expect(catalogTypes).toContain(t);
  });

  it.fails("is a pure module: it imports no renderer and touches no DOM (seam/page-spec-core)", async () => {
    // Runs in the node environment: there is no `document`, so any DOM use throws.
    const { skeleton, applyEdit } = await mod();
    const r = applyEdit(skeleton(), { op: "upsert", id: "t1", type: "text", props: { text: "x" } });
    expect(r.ok).toBe(true);
    expect(typeof document).toBe("undefined");
  });
});
