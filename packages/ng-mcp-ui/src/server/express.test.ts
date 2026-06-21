// Tests for `createMcpExpressRouter` (S05). Uses supertest against a bare
// express app with the router mounted at `/mcp` — the exact mount shape PLAN §3
// generates in the Angular `server.ts`. Exercises the router model (no owned
// `server.express`, no `createApp`, no Vercel/tunnel/dev-server cases).

import type { ErrorRequestHandler } from "express";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createMcpExpressRouter } from "./express.js";
import { McpServer } from "./server.js";
import type { ViewName } from "./types.js";

function resetEnv() {
  delete process.env.NODE_ENV;
}
afterEach(resetEnv);

/**
 * Build a bare express app with the MCP router mounted at `/mcp`, mirroring the
 * generated `server.ts` wiring (`express.json()` then the router).
 */
function appFor(
  server: McpServer,
  options?: Parameters<typeof createMcpExpressRouter>[1],
) {
  const app = express();
  app.use(express.json());
  app.use("/mcp", createMcpExpressRouter(server, options));
  return app;
}

/** A minimal initialize JSON-RPC envelope. */
const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test-client", version: "1.0.0" },
};

const ACCEPT_BOTH = "application/json, text/event-stream";

describe("createMcpExpressRouter", () => {
  it("(a) POST tools/list round-trips JSON-RPC", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      {
        name: "greet",
        description: "greet someone",
        inputSchema: { name: z.string() },
      },
      (args) => ({ content: [{ type: "text", text: `hi ${args.name}` }] }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe("2.0");
    expect(res.body.id).toBe(1);
    const names = (res.body.result.tools as Array<{ name: string }>).map(
      (t) => t.name,
    );
    expect(names).toContain("greet");
  });

  it("(b) POST tools/call executes a registered tool", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      {
        name: "greet",
        description: "greet someone",
        inputSchema: { name: z.string() },
      },
      (args) => ({ content: [{ type: "text", text: `hi ${args.name}` }] }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "greet", arguments: { name: "World" } },
      });

    expect(res.status).toBe(200);
    expect(res.body.result.content).toEqual([
      { type: "text", text: "hi World" },
    ]);
  });

  it("(c) resources/read returns the shell HTML for a view", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      {
        name: "show",
        description: "show a view",
        view: { component: "demo" as ViewName },
      },
      () => ({ content: [{ type: "text", text: "ok" }] }),
    );

    // The apps-sdk view resource URI registered for the `demo` view.
    const uri = "ui://views/apps-sdk/demo.html";

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({
        jsonrpc: "2.0",
        id: 3,
        method: "resources/read",
        params: { uri },
      });

    expect(res.status).toBe(200);
    const contents = res.body.result.contents as Array<{
      mimeType: string;
      text: string;
    }>;
    expect(contents).toHaveLength(1);
    expect(contents[0].mimeType).toBe("text/html+skybridge");
    // AngularShellRenderer (default) markup: window.mcpUi global + #root mount.
    expect(contents[0].text).toContain("window.mcpUi");
    expect(contents[0].text).toContain('viewName: "demo"');
    expect(contents[0].text).toContain('<div id="root"></div>');
  });

  it("(d) malformed JSON returns an error response, not a crash", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    const app = appFor(server);

    const res = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", ACCEPT_BOTH)
      .send('{ "jsonrpc": "2.0", "id": 1, '); // truncated / invalid JSON

    // `express.json()` (mounted upstream by the host app, exactly as PLAN §3
    // wires it) rejects the unparseable body with a 400 via body-parser's own
    // error handler — the request never reaches the MCP transport. The contract
    // that matters: a structured 4xx error, and the server does not crash.
    expect(res.status).toBe(400);

    // Process didn't crash: a follow-up well-formed request still works.
    const ok = await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} });
    expect(ok.status).toBe(200);
  });

  it("(e) GET → 405 JSON-RPC error", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    const res = await request(appFor(server)).get("/mcp");
    expect(res.status).toBe(405);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  it("(e') DELETE → 405 JSON-RPC error", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    const res = await request(appFor(server)).delete("/mcp");
    expect(res.status).toBe(405);
    expect(res.body.error.message).toBe("Method not allowed.");
  });

  it("returns a 500 JSON-RPC error when the MCP handler throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new McpServer({ name: "t", version: "0.0.0" });
    // Force the express error path: connectStatelessTransport rejects, so the
    // handler hits its try/catch → next(error) → default error handler.
    vi.spyOn(server, "connectStatelessTransport").mockRejectedValue(
      new Error("boom"),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error handling MCP request:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("invokes a custom errorMiddleware before the default handler", async () => {
    const calls: string[] = [];
    const errorHandler: ErrorRequestHandler = (_err, _req, res, _next) => {
      calls.push("error-handler");
      res.status(503).json({ custom: true });
    };

    const server = new McpServer({ name: "t", version: "0.0.0" });
    vi.spyOn(server, "connectStatelessTransport").mockRejectedValue(
      new Error("boom"),
    );

    const res = await request(
      appFor(server, { errorMiddleware: [errorHandler] }),
    )
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS });

    expect(calls).toEqual(["error-handler"]);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ custom: true });
  });

  it("handles concurrent POST /mcp without 'Already connected to a transport'", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new McpServer({ name: "concurrent", version: "0.0.0" });
    // Slow tool keeps the transport bound long enough to overlap, exposing any
    // shared-server race in connectStatelessTransport.
    server.registerTool(
      { name: "slow", description: "slow" },
      async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { content: [{ type: "text", text: "done" }] };
      },
    );

    const app = appFor(server);
    const N = 10;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(app)
          .post("/mcp")
          .set("Accept", ACCEPT_BOTH)
          .send({
            jsonrpc: "2.0",
            id: i + 1,
            method: "tools/call",
            params: { name: "slow", arguments: {} },
          }),
      ),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(N).fill(200));
    expect(consoleSpy).not.toHaveBeenCalledWith(
      "Error handling MCP request:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("user middleware mounted before the router runs and can short-circuit", async () => {
    // PLAN §3 model: consumers attach Express middleware to their own app
    // around the router (in place of a path-scoped `use`).
    const calls: string[] = [];
    const server = new McpServer({ name: "t", version: "0.0.0" });

    const app = express();
    app.use(express.json());
    app.use("/mcp", (_req, res, _next) => {
      calls.push("reject");
      res.status(401).json({ error: "Unauthorized" });
    });
    app.use("/mcp", createMcpExpressRouter(server));

    const res = await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

    expect(calls).toEqual(["reject"]);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});
