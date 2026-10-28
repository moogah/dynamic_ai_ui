// The site as a visitor and its owner see it, in one process: the page (src/App) drawn in
// jsdom, its requests to its own origin answered by the owner's server (server/app), and the
// server's two ways out (the Messages API and the data hosts) replaced by scripted fakes.
// No test calls the real model or the internet.
import { vi, expect } from "vitest";
import { createElement } from "react";
import { render, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { load } from "./load";

export const CLAUDE_KEY = "sk-ant-api03-test-key-that-must-stay-on-the-server";

type Json = any;
type FetchLike = (input: any, init?: any) => Promise<Response>;

export interface Deferred<T = void> {
  promise: Promise<T>;
  release: (value: T) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (release = resolve));
  return { promise, release };
}

export const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// Content blocks of a scripted model reply.
export const text = (t: string) => ({ type: "text", text: t });
export const toolUse = (id: string, name: string, input: Json) => ({ type: "tool_use", id, name, input });

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function abortable<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
    work.then(resolve, reject);
  });
}

// ---------------------------------------------------------------------------------------
// The Messages API, scripted. Each reply is taken in order; a held reply waits until the test
// releases it, with the blocks it is released with.

export interface ModelCall {
  url: string;
  headers: Record<string, string>;
  body: Json;
  raw: string;
}

type Step = { blocks?: Json[]; gate?: Deferred<Json[]> };

export class FakeModel {
  calls: ModelCall[] = [];
  private steps: Step[] = [];
  private served = 0;

  reply(...blocks: Json[]): this {
    this.steps.push({ blocks });
    return this;
  }

  held(): Deferred<Json[]> {
    const gate = deferred<Json[]>();
    this.steps.push({ gate });
    return gate;
  }

  fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const raw = await request.text();
    const call: ModelCall = {
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: JSON.parse(raw),
      raw,
    };
    this.calls.push(call);
    const step = this.steps.shift() ?? { blocks: [text("(end of script)")] };
    const blocks = step.gate ? await abortable(step.gate.promise, init?.signal) : step.blocks!;
    const message = {
      id: `msg_test_${++this.served}`,
      type: "message",
      role: "assistant",
      model: call.body.model,
      content: blocks,
      stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    return call.body.stream ? sse(message) : Response.json(message);
  };

  // The tool_result blocks the model received in call `index`.
  toolResults(index: number): Json[] {
    const messages: Json[] = this.calls[index].body.messages;
    const last = messages[messages.length - 1];
    return (Array.isArray(last.content) ? last.content : []).filter((b: Json) => b.type === "tool_result");
  }

  // Everything in call `index` after the last assistant message: what the browser sent with
  // the newest visitor message or tool results.
  newest(index: number): string {
    const messages: Json[] = this.calls[index].body.messages;
    let start = messages.length - 1;
    while (start > 0 && messages[start - 1].role !== "assistant") start--;
    return JSON.stringify(messages.slice(start));
  }
}

export function resultText(block: Json): string {
  if (typeof block.content === "string") return block.content;
  return (block.content ?? []).map((c: Json) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
}

// The same message as a Messages API event stream, for a server that asks for one.
function sse(message: Json): Response {
  const events: Json[] = [{ type: "message_start", message: { ...message, content: [], stop_reason: null } }];
  message.content.forEach((block: Json, index: number) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else {
      events.push({ type: "content_block_start", index, content_block: { ...block, input: {} } });
      events.push({
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
      });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 10 } });
  events.push({ type: "message_stop" });
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

// ---------------------------------------------------------------------------------------
// The data hosts, scripted by hostname. Every request the server makes is recorded, answered
// or not.

export interface HostRequest {
  url: string;
  host: string;
  headers: Record<string, string>;
}

export class FakeHosts {
  requests: HostRequest[] = [];
  private routes = new Map<string, (request: Request) => Response | Promise<Response>>();

  on(host: string, answer: (request: Request) => Response | Promise<Response>): this {
    this.routes.set(host, answer);
    return this;
  }

  fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    this.requests.push({ url: url.href, host: url.hostname, headers: Object.fromEntries(request.headers) });
    const answer = this.routes.get(url.hostname);
    if (!answer) throw new TypeError(`fetch failed: no route to ${url.hostname}`);
    return answer(request);
  };
}

// ---------------------------------------------------------------------------------------
// The browser's network, as the visitor could inspect it.

export interface Exchange {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
}

type Handler = (request: Request) => Promise<Response>;

function routeBrowserTo(handler: Handler, traffic: Exchange[], refused: string[]) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: any, init: any = {}) => {
    // A request that names a connection dispatcher is the server's own outbound transport,
    // never the page.
    if (init && "dispatcher" in init) return realFetch(input, init);
    const base: Request | null = input instanceof Request ? input : null;
    const url = new URL(base ? base.url : String(input), location.href);
    if (url.origin !== location.origin) {
      refused.push(url.href);
      throw new TypeError(`the page may call only its own origin, not ${url.href}`);
    }
    const method = String(init.method ?? base?.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? base?.headers);
    const requestBody =
      init.body != null
        ? await new Response(init.body).text()
        : base && method !== "GET" && method !== "HEAD"
          ? await base.text()
          : undefined;
    const exchange: Exchange = {
      url: url.href,
      method,
      requestHeaders: Object.fromEntries(headers),
      requestBody: requestBody ?? "",
      status: 0,
      responseHeaders: {},
      responseBody: "",
    };
    traffic.push(exchange);
    const work = (async () => {
      const response = await handler(new Request(url.href, { method, headers, body: requestBody }));
      exchange.status = response.status;
      exchange.responseHeaders = Object.fromEntries(response.headers);
      if (!response.body) return new Response(null, { status: response.status, headers: response.headers });
      const [forPage, forRecord] = response.body.tee();
      void new Response(forRecord).text().then((t) => (exchange.responseBody = t), () => {});
      return new Response(forPage, { status: response.status, headers: response.headers });
    })();
    return abortable(work, init.signal ?? base?.signal);
  });
}

// ---------------------------------------------------------------------------------------
// One open page, queried within its own container.

export function pageIn(container: HTMLElement) {
  const q = within(container);
  const main = () => q.getByRole("main");
  const status = () => q.getByRole("status").textContent ?? "";
  const page = {
    container,
    main,
    status,
    chat: () => q.getByRole("log").textContent ?? "",
    messageBox: () => q.getByRole("textbox", { name: "Message" }),
    // The drawn element of a page spec component, or null.
    drawn: (id: string): HTMLElement | null => main().querySelector(`[data-component-id="${id}"]`),
    drawnIds: (): string[] =>
      Array.from(main().querySelectorAll("[data-component-id]")).map((e) => e.getAttribute("data-component-id")!),
    say(message: string) {
      fireEvent.change(page.messageBox(), { target: { value: message } });
      fireEvent.click(q.getByRole("button", { name: "Send" }));
    },
    press(name: "Undo" | "Stop") {
      fireEvent.click(q.getByRole("button", { name }));
    },
    async showsState(label: string) {
      await waitFor(() => expect(status()).toContain(label));
    },
    // Waits for the end of the turn whose final reply is `reply`.
    async settled(reply: string) {
      await waitFor(() => {
        expect(page.chat()).toContain(reply);
        expect(status()).toContain("awaiting the visitor");
      });
    },
  };
  return page;
}

export type Page = ReturnType<typeof pageIn>;

export interface SiteOptions {
  model: FakeModel;
  // The data hosts; leave out to keep the server's own transport.
  hosts?: FakeHosts;
  allowlist?: Array<{ host: string; secret?: { header: string; value: string } }>;
}

export interface Site extends Page {
  traffic: Exchange[];
  // URLs the page tried to call off its own origin.
  refused: string[];
  // Opens the page again in the same browser, as a reload does: fresh modules, same storage.
  reload(): Promise<Page>;
  // Opens a second page against the same server, as a second visitor.
  another(): Promise<Page>;
}

async function drawApp(): Promise<Page> {
  const { App } = await load("/src/App");
  const { container } = render(createElement(App));
  return pageIn(container);
}

export async function openSite(options: SiteOptions): Promise<Site> {
  const { createApp } = await load("/server/app");
  const handler: Handler = createApp({
    anthropicApiKey: CLAUDE_KEY,
    allowlist: options.allowlist ?? [],
    fetchModel: options.model.fetch,
    ...(options.hosts ? { fetchData: options.hosts.fetch } : {}),
  });
  const traffic: Exchange[] = [];
  const refused: string[] = [];
  routeBrowserTo(handler, traffic, refused);
  const page = await drawApp();
  return {
    ...page,
    traffic,
    refused,
    async reload() {
      cleanup();
      vi.resetModules();
      return drawApp();
    },
    another: drawApp,
  };
}

export function closeSite() {
  cleanup();
  vi.unstubAllGlobals();
}

// Everything the visitor can inspect: the page's markup and the browser's traffic.
export function visibleToVisitor(site: Site): string {
  return document.documentElement.outerHTML + JSON.stringify(site.traffic);
}
