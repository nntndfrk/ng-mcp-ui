// Hand-written Angular SSR server (PLAN §3): one Express app hosting both the
// Angular SSR routes AND the MCP endpoints. The MCP JSON-RPC router and the
// widget asset router are mounted BEFORE the Angular SSR catch-all so a
// `POST /mcp` or a `/assets/widgets/*` request never falls through to Angular.
//
// The schematic (a later milestone) generates this file; here it is authored by
// hand as the M1 server-track exit reference and to drive
// `tools/verify-inspector.mjs`.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
import {
  createMcpExpressRouter,
  createViewAssetRouter,
} from "ng-mcp-ui/server";

import { createMcpServer } from "./mcp/server";

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, "../browser");

const app = express();
const angularApp = new AngularNodeAppEngine();
const mcp = createMcpServer();

app.use(express.json());

// MCP JSON-RPC endpoint — host (Claude/ChatGPT) connects here.
app.use("/mcp", createMcpExpressRouter(mcp));

// Built widget chunks + CSS, served with CORS + CSP-friendly caching. Points at
// the widgets build output (`dist/widgets/browser`). The directory may not
// exist until the widgets build has run; the static mount simply 404s missing
// files, which is fine for the M1 server-track gate (the shell HTML comes from
// `resources/read`, not from this router).
app.use(
  "/assets/widgets",
  createViewAssetRouter({
    dir: resolve(serverDistFolder, "../../widgets/browser"),
  }),
);

// Angular SSR catch-all — MUST be last so /mcp and /assets/widgets win first.
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

// Static browser assets (host app), served after the explicit routes above.
app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

if (isMainModule(import.meta.url)) {
  // Destructure rather than `process.env.PORT` / `process.env["PORT"]`: the
  // former trips Angular's `noPropertyAccessFromIndexSignature`, the latter
  // trips Biome's `useLiteralKeys` — destructuring satisfies both.
  const { PORT } = process.env;
  const port = PORT || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
