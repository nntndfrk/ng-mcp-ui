// Tests for `createMcpExpressRouter` (1.x, SDK v2). Uses supertest against a
// bare express app with the router mounted at `/mcp` — the exact mount shape
// the generated Angular `server.ts` uses. The router serves MCP 2026-07-28
// ONLY (`legacy: 'reject'`), so every request stamps the modern `_meta`
// envelope + `Mcp-Method`/`Mcp-Name` routing headers (SEP-2243).

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createMcpExpressRouter } from "./express.js";
import { McpServer } from "./server.js";
import { modernBody, modernHeaders } from "./test-fakes.js";
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

const ACCEPT_BOTH = "application/json, text/event-stream";

describe("createMcpExpressRouter", () => {
  it("(a) POST tools/list round-trips JSON-RPC with 2026-07-28 cache fields", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      {
        name: "greet",
        description: "greet someone",
        inputSchema: z.object({ name: z.string() }),
      },
      (args) => ({ content: [{ type: "text", text: `hi ${args.name}` }] }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/list"))
      .send(modernBody("tools/list"));

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe("2.0");
    expect(res.body.id).toBe(1);
    const names = (res.body.result.tools as Array<{ name: string }>).map(
      (t) => t.name,
    );
    expect(names).toContain("greet");
    // SEP-2549: cacheable list results carry ttlMs/cacheScope on the new wire.
    expect(res.body.result.ttlMs).toBeDefined();
    expect(res.body.result.cacheScope).toBeDefined();
  });

  it("(b) POST tools/call executes a registered tool", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      {
        name: "greet",
        description: "greet someone",
        inputSchema: z.object({ name: z.string() }),
      },
      (args) => ({ content: [{ type: "text", text: `hi ${args.name}` }] }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/call", "greet"))
      .send(
        modernBody(
          "tools/call",
          {
            name: "greet",
            arguments: { name: "World" },
          },
          2,
        ),
      );

    expect(res.status).toBe(200);
    expect(res.body.result.content).toEqual([
      { type: "text", text: "hi World" },
    ]);
  });

  it("(b2) POST tools/call without `arguments` is normalized to {} (#45)", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    // All-optional schema: this isolates the router-level `arguments ??= {}`
    // normalization for schema-carrying tools (the zero-input registration
    // path is covered in server.test.ts).
    server.registerTool(
      { name: "greet", inputSchema: z.object({ name: z.string().optional() }) },
      (args) => ({
        content: [{ type: "text", text: `hi ${args.name ?? "anon"}` }],
      }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/call", "greet"))
      .send(modernBody("tools/call", { name: "greet" }, 2)); // spec-legal: no `arguments` key

    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.result.content).toEqual([
      { type: "text", text: "hi anon" },
    ]);
  });

  it("(b3) POST tools/call with explicit `arguments: null` still fails validation", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    server.registerTool(
      { name: "greet", inputSchema: z.object({ name: z.string().optional() }) },
      (args) => ({
        content: [{ type: "text", text: `hi ${args.name ?? "anon"}` }],
      }),
    );

    const res = await request(appFor(server))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/call", "greet"))
      // `null` is NOT an omitted key — it's an invalid value and must keep
      // surfacing a validation error, not be coerced to `{}`.
      .send(modernBody("tools/call", { name: "greet", arguments: null }, 2));

    // The exact code/status is SDK-internal; the contract that matters is: an
    // error, never a silently-coerced success.
    expect(res.body.error).toBeDefined();
    expect(res.body.result).toBeUndefined();
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
      .set(modernHeaders("resources/read", uri))
      .send(modernBody("resources/read", { uri }, 3));

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
    // v2 advertises the tools capability only once a tool exists; register one
    // so the follow-up `tools/list` probe below answers 200, not -32601.
    server.registerTool({ name: "noop" }, () => ({ content: "ok" }));
    const app = appFor(server);

    const res = await request(app)
      .post("/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", ACCEPT_BOTH)
      .send('{ "jsonrpc": "2.0", "id": 1, '); // truncated / invalid JSON

    // `express.json()` (mounted upstream by the host app) rejects the
    // unparseable body with a 400 via body-parser's own error handler — the
    // request never reaches the MCP handler. The contract that matters: a
    // structured 4xx error, and the server does not crash.
    expect(res.status).toBe(400);

    // Process didn't crash: a follow-up well-formed request still works.
    const ok = await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/list"))
      .send(modernBody("tools/list", {}, 9));
    expect(ok.status).toBe(200);
  });

  it("(e) bodyless GET / DELETE get structured JSON-RPC errors from the SDK", async () => {
    // 1.x forwards every verb to the SDK handler — modern-era verb semantics
    // (POST JSON-RPC; no 2025 session GET/DELETE) are the SDK's contract. The
    // assertion here is ours: a structured JSON-RPC error body, never a crash.
    const server = new McpServer({ name: "t", version: "0.0.0" });
    const app = appFor(server);

    const get = await request(app).get("/mcp");
    expect(get.status).toBeGreaterThanOrEqual(400);
    expect(get.body.error).toBeDefined();

    const del = await request(app).delete("/mcp");
    expect(del.status).toBeGreaterThanOrEqual(400);
    expect(del.body.error).toBeDefined();
  });

  it("answers 500 -32603 and reports via onerror when the blueprint factory throws", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    vi.spyOn(server, "buildInstance").mockImplementation(() => {
      throw new Error("boom");
    });
    const onerror = vi.fn();

    const res = await request(appFor(server, { onerror }))
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set(modernHeaders("tools/list"))
      .send(modernBody("tools/list"));

    // SDK v2 owns this error path: the handler answers the JSON-RPC 500 itself
    // (our express `errorMiddleware` only sees adapter-level failures).
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: 1,
    });
    expect(onerror).toHaveBeenCalledWith(expect.any(Error));
  });

  it("handles concurrent POST /mcp (fresh per-request instances, no shared-transport race)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new McpServer({ name: "concurrent", version: "0.0.0" });
    // Slow tool keeps requests overlapping; every request gets its own SDK
    // server instance from the factory, so nothing is shared.
    server.registerTool({ name: "slow", description: "slow" }, async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { content: [{ type: "text", text: "done" }] };
    });

    const app = appFor(server);
    const N = 10;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(app)
          .post("/mcp")
          .set("Accept", ACCEPT_BOTH)
          .set(modernHeaders("tools/call", "slow"))
          .send(
            modernBody("tools/call", { name: "slow", arguments: {} }, i + 1),
          ),
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
    // Consumers attach Express middleware to their own app around the router.
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
      .set(modernHeaders("tools/list"))
      .send(modernBody("tools/list"));

    expect(calls).toEqual(["reject"]);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});
