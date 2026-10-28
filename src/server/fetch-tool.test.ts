import { describe, expect, it } from "vitest";

const mod = () => import("./fetch-tool");

type Reply = { status: number; headers: Record<string, string>; body: string };
function setup(opts: { replies?: Record<string, Reply>; maxBytes?: number } = {}) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const transport = async (req: { url: string; headers: Record<string, string> }): Promise<Reply> => {
    requests.push(req);
    return opts.replies?.[req.url] ?? { status: 200, headers: { "content-type": "application/json" }, body: "{}" };
  };
  const resolve = async (host: string) => (host === "internal.test" ? "10.0.0.5" : "93.184.216.34");
  return { requests, transport, resolve };
}

describe("seam/allowlist-fetch", () => {
  it.fails("refuses a host that is not on the allowlist, names the allowed hosts and makes no request (Scenario: data-fetch § A host not on the list is refused; seam/allowlist-fetch)", async () => {
    const { createFetchTool } = await mod();
    const env = setup();
    const fetchUrl = createFetchTool({ allowlist: { "api.open-meteo.com": {} }, resolve: env.resolve, transport: env.transport });
    const result = await fetchUrl("https://example.org/data");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("api.open-meteo.com");
    expect(env.requests).toEqual([]);
  });

  it.fails("does not follow a redirect to a host off the list (Scenario: data-fetch § A redirect off the list is not followed; seam/allowlist-fetch)", async () => {
    const { createFetchTool } = await mod();
    const env = setup({ replies: { "https://api.open-meteo.com/r": { status: 302, headers: { location: "https://evil.example.net/steal" }, body: "" } } });
    const fetchUrl = createFetchTool({ allowlist: { "api.open-meteo.com": {} }, resolve: env.resolve, transport: env.transport });
    const result = await fetchUrl("https://api.open-meteo.com/r");
    expect(result.ok).toBe(false);
    expect(env.requests.map((r) => r.url)).toEqual(["https://api.open-meteo.com/r"]);
  });

  it.fails("refuses an allowlisted host that resolves to a private address, checked at connection time (seam/allowlist-fetch)", async () => {
    const { createFetchTool } = await mod();
    const env = setup();
    const fetchUrl = createFetchTool({ allowlist: { "internal.test": {} }, resolve: env.resolve, transport: env.transport });
    const result = await fetchUrl("https://internal.test/x");
    expect(result.ok).toBe(false);
    expect(env.requests).toEqual([]);
  });

  it.fails("trims a response over the size limit and says it was trimmed and how much was left out (Scenario: data-fetch § A trimmed result says so; seam/allowlist-fetch)", async () => {
    const { createFetchTool } = await mod();
    const big = "x".repeat(1000);
    const env = setup({ replies: { "https://api.open-meteo.com/big": { status: 200, headers: {}, body: big } } });
    const fetchUrl = createFetchTool({ allowlist: { "api.open-meteo.com": {} }, resolve: env.resolve, transport: env.transport, maxBytes: 100 });
    const result = await fetchUrl("https://api.open-meteo.com/big");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trimmed).toBe(true);
      expect(result.omittedBytes).toBe(900);
      expect(result.body.length).toBeLessThanOrEqual(100);
    }
  });

  it.fails("adds the host's secret to the request and keeps it out of the result (seam/allowlist-fetch)", async () => {
    const { createFetchTool } = await mod();
    const env = setup();
    const fetchUrl = createFetchTool({
      allowlist: { "api.keyed.test": { secret: { header: "x-api-key", value: "S3CRET" } } },
      resolve: env.resolve,
      transport: env.transport,
    });
    const result = await fetchUrl("https://api.keyed.test/v1");
    expect(env.requests[0].headers["x-api-key"]).toBe("S3CRET");
    expect(JSON.stringify(result)).not.toContain("S3CRET");
  });
});
