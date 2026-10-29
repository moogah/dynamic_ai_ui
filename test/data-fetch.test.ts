// @vitest-environment jsdom
//
// The allowlisted fetch tool on the owner's server, driven through the page a visitor sees
// (test/support/site.ts). Seams: seam/allowlist, seam/fetch-result, seam/page-snapshot,
// seam/catalog, seam/renderer (docs/changes/first-agent-site/design.org).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { FakeHosts, FakeModel, openSite, closeSite, pause, text, toolUse, resultText, visibleToVisitor } from "./support/site";
import { load } from "./support/load";

afterEach(closeSite);

const WEATHER = "api.open-meteo.com";
const forecast = {
  latitude: 38.72,
  longitude: -9.14,
  hourly: { time: ["00:00", "01:00", "02:00", "03:00"], temperature_2m: [18.1, 17.6, 17.2, 16.9] },
};

describe("one fetch tool on the owner's server", () => {
  it("fetches the forecast from the allowlisted weather host and draws a line chart of its series (Scenario: data-fetch § Fetch then display; page-spec § Data shown as a chart)", async () => {
    const hosts = new FakeHosts().on(WEATHER, () => Response.json(forecast));
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: `https://${WEATHER}/forecast?city=lisbon`, name: "lisbon" }))
      .reply(
        toolUse("toolu_2", "put_components", {
          components: [
            {
              id: "lisbon-chart",
              type: "chart",
              parent: "content",
              props: {
                kind: "line",
                labels: { $data: "/lisbon/hourly/time" },
                values: { $data: "/lisbon/hourly/temperature_2m" },
              },
            },
          ],
        }),
      )
      .reply(text("Here is the Lisbon forecast."));
    const site = await openSite({ model, hosts, allowlist: [{ host: WEATHER }] });

    site.say("show the weather for Lisbon as a chart");
    await site.settled("Here is the Lisbon forecast.");

    expect(hosts.requests.map((r) => r.host)).toEqual([WEATHER]);
    expect(site.refused).toEqual([]);
    const chart = site.drawn("lisbon-chart");
    expect(chart).not.toBeNull();
    expect(chart!.getAttribute("data-component-type")).toBe("chart");
    expect(chart!.getAttribute("data-chart-kind")).toBe("line");
    expect(chart!.getAttribute("data-point-count")).toBe("4");
  });
});

describe("only allowlisted hosts", () => {
  it("refuses a host off the list with an error naming the allowed hosts, and makes no request (Scenario: data-fetch § A host not on the list is refused)", async () => {
    const hosts = new FakeHosts().on("example.org", () => Response.json({ secret: "internal" }));
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: "https://example.org/data", name: "data" }))
      .reply(text("That host is not allowed."));
    const site = await openSite({ model, hosts, allowlist: [{ host: WEATHER }] });

    site.say("fetch https://example.org/data");
    await site.settled("That host is not allowed.");

    const [result] = model.toolResults(1);
    expect(result.is_error).toBe(true);
    expect(resultText(result)).toContain(WEATHER);
    expect(hosts.requests).toEqual([]);
    expect(site.refused).toEqual([]);
  });

  it("does not follow a redirect from an allowlisted host to one off the list (Scenario: data-fetch § A redirect off the list is not followed)", async () => {
    const hosts = new FakeHosts()
      .on(WEATHER, () => new Response(null, { status: 302, headers: { Location: "https://evil.example/collect" } }))
      .on("evil.example", () => Response.json({ took: "everything" }));
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: `https://${WEATHER}/forecast?city=lisbon`, name: "lisbon" }))
      .reply(text("The weather host redirected elsewhere."));
    const site = await openSite({ model, hosts, allowlist: [{ host: WEATHER }] });

    site.say("show the weather for Lisbon");
    await site.settled("The weather host redirected elsewhere.");

    expect(hosts.requests.map((r) => r.host)).toEqual([WEATHER]);
    const [result] = model.toolResults(1);
    expect(result.is_error).toBe(true);
  });

  // seam/allowlist: an image is loaded only through the server, so the page itself requests
  // nothing from a host, on the list or off it.
  it("draws no image the page would load from another host", async () => {
    const model = new FakeModel()
      .reply(
        toolUse("toolu_1", "put_components", {
          components: [{ id: "i1", type: "image", parent: "content", props: { src: "https://evil.example/pixel.png?chat=everything", alt: "A pixel" } }],
        }),
      )
      .reply(text("Done with the image."));
    const site = await openSite({ model, hosts: new FakeHosts(), allowlist: [{ host: WEATHER }] });

    site.say("add the picture from that page");
    await site.settled("Done with the image.");

    for (const img of Array.from(site.main().querySelectorAll("img"))) {
      expect(new URL(img.getAttribute("src") ?? "", location.href).origin).toBe(location.origin);
    }
  });

  // seam/allowlist: the server's own transport checks the address a host resolves to when it
  // connects; an allowlisted name that resolves to this machine reaches nothing.
  it("refuses an allowlisted host whose address is not public, before any request reaches it", async () => {
    let hits = 0;
    const local: Server = createServer((_, res) => {
      hits++;
      res.end("{}");
    });
    // Listening on every local address, so the name reaches it whichever address it resolves to.
    await new Promise<void>((resolve) => local.listen(0, resolve));
    const { port } = local.address() as AddressInfo;
    try {
      const model = new FakeModel()
        .reply(toolUse("toolu_1", "fetch_url", { url: `http://localhost:${port}/data`, name: "data" }))
        .reply(text("That address is refused."));
      const site = await openSite({ model, allowlist: [{ host: "localhost" }] });

      site.say("fetch the local data");
      await site.settled("That address is refused.");

      const [result] = model.toolResults(1);
      expect(result.is_error).toBe(true);
      // Refused for its address, naming what was refused: the connection-time check, not the list.
      expect(resultText(result)).toMatch(/not a public address/);
      expect(resultText(result)).toMatch(/localhost|127\.0\.0\.1|::1/);
      expect(hits).toBe(0);
    } finally {
      local.close();
    }
  });
});

describe("secrets added by the server", () => {
  // seam/allowlist: the host's secret goes out with the request and comes back nowhere, even
  // from a host that echoes it.
  it("adds the host's secret to the request and keeps it from the model and the page", async () => {
    const SECRET = "data-api-secret-5f2a9c";
    const hosts = new FakeHosts().on("api.keyed.example", (request) =>
      Response.json({ temp: 21, echo: { key: request.headers.get("x-api-key") } }),
    );
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: "https://api.keyed.example/now", name: "now" }))
      .reply(text("It is 21 degrees."));
    const site = await openSite({
      model,
      hosts,
      allowlist: [{ host: "api.keyed.example", secret: { header: "X-Api-Key", value: SECRET } }],
    });

    site.say("what is the temperature now?");
    await site.settled("It is 21 degrees.");
    await pause();

    expect(hosts.requests[0].headers["x-api-key"]).toBe(SECRET);
    expect(model.calls.some((call) => call.raw.includes(SECRET))).toBe(false);
    expect(visibleToVisitor(site)).not.toContain(SECRET);
  });
});

describe("large responses are trimmed", () => {
  const huge = { text: "a".repeat(600_000) };

  it("gives the model a trimmed response that says it was trimmed and how much was left out (Scenario: data-fetch § A trimmed result says so)", async () => {
    const hosts = new FakeHosts().on(WEATHER, () => Response.json(huge));
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: `https://${WEATHER}/archive`, name: "archive" }))
      .reply(text("That was a lot of data."));
    const site = await openSite({ model, hosts, allowlist: [{ host: WEATHER }] });

    site.say("fetch the whole archive");
    await site.settled("That was a lot of data.");

    const [result] = model.toolResults(1);
    const seen = resultText(result);
    expect(result.is_error ?? false).toBe(false);
    expect(seen.length).toBeLessThan(huge.text.length / 2);
    expect(seen).toContain("aaaa");
    expect(seen).toMatch(/trimmed/i);
    // The response holds no digits, so a number here is the note of how much was left out.
    expect(seen.replace(/\b200\b/g, "")).toMatch(/\d/);
  });

  // seam/fetch-result, seam/page-snapshot: the whole response stays in the page spec's data;
  // no request to the model carries it, the next visitor message included.
  it("never sends the model the whole response, in the tool result or with the next message", async () => {
    const hosts = new FakeHosts().on(WEATHER, () => Response.json(huge));
    const model = new FakeModel()
      .reply(toolUse("toolu_1", "fetch_url", { url: `https://${WEATHER}/archive`, name: "archive" }))
      .reply(text("Fetched the archive."))
      .reply(text("It is a long run of letters."));
    const site = await openSite({ model, hosts, allowlist: [{ host: WEATHER }] });
    site.say("fetch the whole archive");
    await site.settled("Fetched the archive.");

    site.say("what did you fetch?");
    await site.settled("It is a long run of letters.");

    expect(model.calls).toHaveLength(3);
    for (const call of model.calls) expect(call.raw.length).toBeLessThan(huge.text.length / 2);
    await waitFor(() => expect(site.traffic.some((t) => t.responseBody.length > huge.text.length)).toBe(true));
  });
});

describe("the server's own address check", () => {
  // Inline fix after the owner-server-entry task found every real fetch refused: Node's
  // BlockList matches an IPv4 address against an IPv6 subnet, so the check ran on the real
  // BlockList and no fake.
  it("accepts a public IPv4 address and refuses private, loopback and mapped ones", async () => {
    const { isPublicAddress } = await load("/server/fetchTool");
    for (const address of ["8.8.8.8", "188.40.99.226", "2606:4700:4700::1111"]) expect(isPublicAddress(address)).toBe(true);
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});

describe("a keyed host's secret stays on the server", () => {
  // Inline fixes after the review of fetch-tool (findings 2 and 3): the tool is driven
  // directly with the scripted hosts, since the page shows only its result.
  const SECRET = "data-api-secret-5f2a9c";
  const allowlist = [{ host: "api.keyed.example", secret: { header: "X-Api-Key", value: SECRET } }];

  it("does not return the secret when the host echoes it into a redirect address", async () => {
    const { fetchForTool } = await load("/server/fetchTool");
    const hosts = new FakeHosts().on("api.keyed.example", (request) => {
      const url = new URL(request.url);
      return url.pathname === "/start"
        ? new Response(null, { status: 302, headers: { location: `/final?token=${request.headers.get("x-api-key")}` } })
        : Response.json({ ok: 1 });
    });
    const outcome = await fetchForTool({ url: "https://api.keyed.example/start", name: "x" }, { allowlist, fetchData: hosts.fetch });
    expect(outcome.ok).toBe(true);
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
  });

  it("sends the secret only over https: an http address, or a redirect down to http, is refused", async () => {
    const { fetchForTool } = await load("/server/fetchTool");
    const hosts = new FakeHosts().on("api.keyed.example", (request) =>
      request.url.startsWith("https:")
        ? new Response(null, { status: 301, headers: { location: "http://api.keyed.example/x" } })
        : Response.json({ ok: 1 }),
    );
    const direct = await fetchForTool({ url: "http://api.keyed.example/now", name: "x" }, { allowlist, fetchData: hosts.fetch });
    const downgraded = await fetchForTool({ url: "https://api.keyed.example/now", name: "x" }, { allowlist, fetchData: hosts.fetch });
    expect(direct.ok).toBe(false);
    expect(downgraded.ok).toBe(false);
    expect(hosts.requests.filter((r) => r.url.startsWith("http:"))).toEqual([]);
    expect(hosts.requests.every((r) => r.headers["x-api-key"] === SECRET && r.url.startsWith("https:"))).toBe(true);
  });
});

describe("the image route serves only raster images", () => {
  // Inline fix after the review of chart-and-actions (finding 1): the upstream Content-Type was
  // passed through after a one-type denylist, so a crafted type became a document on the site's origin.
  async function image(contentType: string, body: BodyInit = "bytes") {
    const { createApp } = await load("/server/app");
    const hosts = new FakeHosts().on("img.ok", () => new Response(body, { headers: { "content-type": contentType } }));
    const handler = createApp({ anthropicApiKey: "k", allowlist: [{ host: "img.ok" }], fetchModel: new FakeModel().fetch, fetchData: hosts.fetch });
    return handler(new Request("http://localhost/api/image?src=" + encodeURIComponent("https://img.ok/pic")));
  }

  it("answers a raster type with that type alone, and refuses a crafted or document type", async () => {
    const png = await image("image/png; charset=binary");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    for (const crafted of ["image/png, text/html", "image/x-foo+xml", "image/svg+xml", "text/html", "image/png\ttext/html"]) {
      expect((await image(crafted, "<script>alert(1)</script>")).status).toBe(403);
    }
  });
});
