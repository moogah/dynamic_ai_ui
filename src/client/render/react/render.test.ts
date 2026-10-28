// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

const render = () => import(/* @vite-ignore */ new URL("./index.ts", import.meta.url).href);
const store = () => import(/* @vite-ignore */ new URL("../../store.ts", import.meta.url).href);

describe("seam/page-renderer", () => {
  it.fails("draws the skeleton: a header area and an empty content area (Scenario: page-spec § The skeleton on first load; seam/page-renderer)", async () => {
    const { mountPage } = await render();
    const { createPageStore } = await store();
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPage(root, createPageStore());
    expect(root.querySelector("[data-component-id='header']")).not.toBeNull();
    const content = root.querySelector("[data-component-id='content']");
    expect(content).not.toBeNull();
    expect(content!.children.length).toBe(0);
  });

  it.fails("shows an edit without a reload and leaves the rest of the page unchanged (Scenario: page-spec § An edit appears without a reload; seam/page-renderer)", async () => {
    const { mountPage } = await render();
    const { createPageStore } = await store();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const s = createPageStore();
    mountPage(root, s);
    const header = root.querySelector("[data-component-id='header']")!;
    const headerHtml = header.outerHTML;
    s.apply({ op: "upsert", id: "c1", type: "card", props: { title: "Weather" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector("[data-component-id='c1']")).not.toBeNull();
    expect(root.querySelector("[data-component-id='header']")!.outerHTML).toBe(headerHtml);
  });

  it.fails("draws a line chart bound to a series held in the page spec (Scenario: page-spec § Data shown as a chart; seam/page-renderer)", async () => {
    const { mountPage } = await render();
    const { createPageStore } = await store();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const s = createPageStore();
    mountPage(root, s);
    s.apply({ op: "setData", key: "forecast", value: [{ x: "Mon", y: 20 }, { x: "Tue", y: 22 }] });
    s.apply({ op: "upsert", id: "ch1", type: "chart", props: { kind: "line", data: "forecast" } });
    await new Promise((r) => setTimeout(r, 0));
    const chart = root.querySelector("[data-component-id='ch1']");
    expect(chart).not.toBeNull();
    expect(chart!.querySelector("svg, canvas")).not.toBeNull();
  });
});
