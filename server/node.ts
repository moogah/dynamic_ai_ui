// Between Node's http server and the fetch-style handler: a Node request as a Request, and a
// Response written back to Node's response.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Handler } from "./app";

export async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD" && chunks.length > 0;
  return new Request(new URL(req.url ?? "/", origin), { method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

export async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

// Answers one Node request with the handler; a failure inside it is a 500 with its message.
export async function serveWith(handler: Handler, req: IncomingMessage, res: ServerResponse, origin: string): Promise<void> {
  try {
    await send(res, await handler(await toRequest(req, origin)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await send(res, Response.json({ error: message }, { status: 500 }));
  }
}
