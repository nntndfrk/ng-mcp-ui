// The minimal `echo` tool (PLAN §10.4).
//
// A single `echo` tool paired with the `echo` view — the smallest possible
// reference for the MCP server library: it renders `toolOutput` and nothing
// else. Kept in its own file so the minimal variant is a self-contained,
// deletable unit: one tool file + one `registerEchoTool(server)` call + one
// `ViewNameRegistry` entry (in `src/mcp/server.ts`).

import type { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

/**
 * Register the minimal `echo` tool on an {@link McpServer}. Called from
 * `createMcpServer()`. The `echo` view component must be registered in
 * `ViewNameRegistry` (done in `src/mcp/server.ts`) for `view.component` to
 * typecheck.
 */
export function registerEchoTool(server: McpServer): void {
  server.registerTool(
    {
      name: "echo",
      title: "Echo",
      description: "Echoes the message back, and renders it in the echo view.",
      inputSchema: { message: z.string() },
      outputSchema: { message: z.string() },
      view: {
        component: "echo",
        description: "Renders the echoed message.",
      },
    },
    (args) => {
      const message = args.message;
      return {
        content: message,
        structuredContent: { message },
      };
    },
  );
}
