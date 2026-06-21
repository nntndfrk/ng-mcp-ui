// The dev-app's MCP server (echo-only minimal variant).
//
// `createMcpServer()` is consumed by `src/server.ts` (mounted at `/mcp`). The
// schematic generates this file in real apps; here it is the hand-written
// reference exercised by `tools/verify-inspector.mjs` (the M1 server-track gate).

import { McpServer } from "ng-mcp-ui/server";

import { registerEchoTool } from "./tools/echo";
import { resolveViewManifest } from "./views.manifest";

// Narrow `ViewName` to include this app's views. The view generator (a later
// milestone) emits this augmentation into a generated `.d.ts`; inline here for
// the hand-built dev-app so `view: { component: 'echo' }` typechecks.
declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    echo: true;
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "dev-app", version: "0.0.0" },
    { viewManifest: resolveViewManifest() },
  );

  // The minimal echo variant: a single `echo` view tool.
  registerEchoTool(server);

  return server;
}
