/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";

// In development Vite's dev server sits in front of the owner's server (design D1): the page's
// requests under /api/ go to the handler server/config.ts makes from the allowlist file and the
// environment, loaded on the first such request; everything else is the page, from Vite.
function ownerServer(): Plugin {
  return {
    name: "owner-server",
    apply: "serve",
    configureServer(server) {
      let ready: Promise<{ serve: (req: any, res: any) => Promise<void> }> | undefined;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        ready ??= (async () => {
          const config = await server.ssrLoadModule("/server/config.ts");
          const node = await server.ssrLoadModule("/server/node.ts");
          const handler = config.loadHandler(server.config.root);
          return { serve: (rq: any, rs: any) => node.serveWith(handler, rq, rs, `http://${rq.headers.host ?? "localhost"}`) };
        })();
        ready.then((owner) => owner.serve(req, res), (error) => {
          ready = undefined;
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [ownerServer()],
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The overlay's test command passes --reporter=junit, which takes its options from this
    // entry: stdout keeps the report on the run's output instead of a file under .vitest/.
    reporters: ["default", ["junit", { stdout: true }]],
  },
});
