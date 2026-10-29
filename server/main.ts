// The owner's Node entry (design D1, D8): reads the allowlist file and the environment, makes
// the handler with createApp, and serves it and the built page (dist/) on one port, PORT or
// 8080. Run from the project root after the build: `npm run build && npm start`.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { loadHandler, SERVER_PREFIX } from "./config";
import { send, serveWith } from "./node";

const root = process.cwd();
const dist = resolve(root, "dist");
const port = Number(process.env.PORT ?? 8080);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// A file of the built page, or index.html for the root; nothing outside dist/.
async function staticFile(pathname: string): Promise<Response> {
  try {
    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    const file = normalize(join(dist, relative));
    if (!file.startsWith(dist + "/")) return new Response("not found", { status: 404 });
    if (!(await stat(file)).isFile()) return new Response("not found", { status: 404 });
    return new Response(await readFile(file), { headers: { "content-type": types[extname(file)] ?? "application/octet-stream" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

const handler = loadHandler(root);

export const server = createServer((req, res) => {
  // The Host header is the visitor's to write: nothing here is built from it.
  const origin = "http://localhost";
  let pathname: string;
  try {
    ({ pathname } = new URL(req.url ?? "/", origin));
  } catch {
    return void send(res, new Response("bad request", { status: 400 }));
  }
  if (pathname.startsWith(SERVER_PREFIX)) return void serveWith(handler, req, res, origin);
  if (req.method !== "GET" && req.method !== "HEAD") return void send(res, new Response("GET only", { status: 405 }));
  void staticFile(pathname).then((response) => send(res, response)).catch(() => send(res, new Response("server error", { status: 500 })).catch(() => res.destroy()));
});

server.listen(port, () => {
  const address = server.address();
  console.log(`serving on http://localhost:${typeof address === "object" && address ? address.port : port}`);
});
