// @vitest-environment jsdom
//
// The page spec, the component catalog, drawing and undo, driven through the page a visitor
// sees (test/support/site.ts). Seams: seam/page-store, seam/catalog, seam/page-tools,
// seam/renderer, seam/page-snapshot (docs/changes/first-agent-site/design.org).
import { describe, it, expect, afterEach } from "vitest";
import { waitFor, within, fireEvent } from "@testing-library/react";
import { FakeModel, openSite, closeSite, text, toolUse, resultText } from "./support/site";

afterEach(closeSite);

const card = (id: string, title: string) => ({ id, type: "card", parent: "content", props: { title, body: "From the assistant." } });

describe("the page is drawn from the page spec", () => {
  it("shows the skeleton, a header area and an empty content area, beside the chat (Scenario: page-spec § The skeleton on first load)", async () => {
    const site = await openSite({ model: new FakeModel() });

    expect(site.drawn("header")).not.toBeNull();
    const content = site.drawn("content");
    expect(content).not.toBeNull();
    expect(content!.querySelector("[data-component-id]")).toBeNull();
    expect(site.main().contains(site.messageBox())).toBe(false);
    expect(site.status()).toContain("idle");
  });

  it("draws a card the assistant adds during a turn and leaves the rest of the page in place (Scenario: page-spec § An edit appears without a reload)", async () => {
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "put_components", { components: [card("c1", "Welcome")] }))
      .reply(text("Added a card."));
    const site = await openSite({ model });
    const header = site.drawn("header");
    const before = site.drawnIds();

    site.say("add a welcome card");
    await waitFor(() => expect(site.drawn("c1")).not.toBeNull());
    await site.settled("Added a card.");

    expect(site.drawn("content")!.contains(site.drawn("c1"))).toBe(true);
    expect(site.drawn("c1")!.textContent).toContain("Welcome");
    expect(site.drawn("header")).toBe(header);
    expect(site.drawnIds().filter((id) => id !== "c1")).toEqual(before);
    expect(site.chat()).toContain("add a welcome card");
  });
});

describe("only catalog types are drawn", () => {
  it("rejects a component of a type the catalog lacks, naming the allowed types, and changes nothing (Scenario: page-spec § An unknown type is rejected)", async () => {
    const model = new FakeModel()
      .reply(
        toolUse("toolu_1", "put_components", {
          components: [card("c1", "Next to the map"), { id: "m1", type: "map", parent: "content", props: { place: "Lisbon" } }],
        }),
      )
      .reply(text("The catalog has no map."));
    const site = await openSite({ model });
    const before = site.drawnIds();

    site.say("add a map of Lisbon");
    await site.settled("The catalog has no map.");

    const [result] = model.toolResults(1);
    expect(result.tool_use_id).toBe("toolu_1");
    expect(result.is_error).toBe(true);
    for (const type of ["heading", "text", "card", "table", "chart"]) expect(resultText(result)).toContain(type);
    expect(site.drawnIds()).toEqual(before);
  });
});

describe("the page spec holds no markup", () => {
  // seam/catalog: a prop is drawn as what it says, never as markup.
  it("draws markup in a text component as plain text", async () => {
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "put_components", { components: [{ id: "x1", type: "text", parent: "content", props: { text: "<b>bold</b><img src=x>" } }] }))
      .reply(text("Added the text."));
    const site = await openSite({ model });

    site.say("add some text");
    await site.settled("Added the text.");

    expect(site.drawn("x1")!.textContent).toContain("<b>bold</b><img src=x>");
    expect(site.drawn("x1")!.querySelector("b, img")).toBeNull();
  });

  // seam/page-actions: a button on the page acts by sending a visitor message, as if typed.
  it("sends a visitor message when the visitor presses a button the assistant drew (Scenario: page-spec § A button sends a visitor message)", async () => {
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "put_components", { components: [{ id: "b1", type: "button", parent: "content", props: { label: "Show tomorrow" } }] }))
      .reply(text("Press it when you like."))
      .reply(text("Here is tomorrow."));
    const site = await openSite({ model });
    site.say("give me a button for tomorrow");
    await site.settled("Press it when you like.");

    expect(site.drawn("b1")).not.toBeNull();
    fireEvent.click(within(site.main()).getByRole("button", { name: "Show tomorrow" }));
    await site.settled("Here is tomorrow.");

    expect(model.calls).toHaveLength(3);
    expect(model.newest(2)).toContain("Show tomorrow");
  });
});

describe("the page spec lasts for the visit only", () => {
  it("returns the skeleton on a reload after the page was shaped (Scenario: page-spec § A reload returns the skeleton)", async () => {
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "put_components", { components: [card("c1", "Welcome")] }))
      .reply(text("Added a card."));
    const site = await openSite({ model });
    const skeleton = site.drawnIds();
    site.say("add a welcome card");
    await site.settled("Added a card.");
    expect(site.drawn("c1")).not.toBeNull();

    const reloaded = await site.reload();

    expect(reloaded.drawnIds()).toEqual(skeleton);
    expect(reloaded.drawn("c1")).toBeNull();
  });
});

describe("undo the assistant's last turn", () => {
  const table = {
    id: "t1",
    type: "table",
    parent: "content",
    props: { rows: [{ city: "Lisbon", temp: 18 }, { city: "Porto", temp: 15 }] },
  };

  async function tableRemovedByTheLastTurn(model: FakeModel) {
    model
      .reply(toolUse("toolu_1", "put_components", { components: [table] }))
      .reply(text("Here is the table."))
      .reply(toolUse("toolu_2", "remove_component", { id: "t1" }))
      .reply(text("Removed the table."));
    const site = await openSite({ model });
    site.say("show the temperatures as a table");
    await site.settled("Here is the table.");
    const withTable = site.drawnIds();
    site.say("tidy the page up");
    await site.settled("Removed the table.");
    expect(site.drawn("t1")).toBeNull();
    return { site, withTable };
  }

  it("puts back the table the last turn removed (Scenario: page-spec § Undo restores the page before the last turn)", async () => {
    const { site, withTable } = await tableRemovedByTheLastTurn(new FakeModel());

    site.press("Undo");

    await waitFor(() => expect(site.drawn("t1")).not.toBeNull());
    expect(site.drawnIds()).toEqual(withTable);
    expect(site.drawn("t1")!.textContent).toContain("Lisbon");
    expect(site.drawn("t1")!.textContent).toContain("Porto");
  });

  // seam/page-snapshot: the model learns the page undo left from the next visitor message.
  it("tells the model, with the next visitor message, the page as undo left it", async () => {
    const model = new FakeModel();
    const { site } = await tableRemovedByTheLastTurn(model);
    site.press("Undo");
    await waitFor(() => expect(site.drawn("t1")).not.toBeNull());
    model.reply(text("The table is back."));

    site.say("what is on the page now?");
    await site.settled("The table is back.");

    expect(model.newest(model.calls.length - 1)).toContain("t1");
  });
});
