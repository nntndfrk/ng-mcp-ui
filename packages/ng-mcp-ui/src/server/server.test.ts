import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod";
import { McpServer } from "./server.js";
import { connectModern, rpc } from "./test-fakes.js";
import type { ViewName } from "./types.js";
import { InMemoryViewManifest, type ViewManifest } from "./view-manifest.js";

// `ViewName` is narrowed to `never` until a `ViewNameRegistry` augmentation
// exists, so test view component names are cast.
const view = (component: string) => ({ component: component as ViewName });

function resetEnv() {
  delete process.env.NODE_ENV;
}

afterEach(resetEnv);

describe("McpServer.registerTool — tools/list", () => {
  it("(a) exposes the tool with view _meta (outputTemplate + ui.resourceUri)", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "create_poll",
        description: "Create a poll",
        inputSchema: z.object({ question: z.string() }),
        view: { component: "poll" as ViewName, description: "Poll view" },
      },
      async ({ question }) => ({
        content: `Poll: ${question}`,
        structuredContent: { question },
      }),
    );

    const { client, close } = await connectModern(server);
    const { tools } = await client.listTools();
    await close();

    expect(tools).toHaveLength(1);
    const tool = tools[0];
    expect(tool?.name).toBe("create_poll");
    const meta = tool?._meta as Record<string, unknown>;
    expect(meta?.["openai/outputTemplate"]).toBe(
      "ui://views/apps-sdk/poll.html",
    );
    expect(meta?.ui).toEqual({ resourceUri: "ui://views/ext-apps/poll.html" });
  });

  it("registers a plain tool with no view (no view _meta, no resources)", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "echo", inputSchema: z.object({ msg: z.string() }) },
      async ({ msg }) => ({ content: msg, structuredContent: { msg } }),
    );

    const { client, close } = await connectModern(server);
    const { tools } = await client.listTools();
    await close();

    expect(tools).toHaveLength(1);
    // No view → no view wiring on the tool _meta (and no view resources; the
    // per-request instance only advertises the resources capability once a
    // view registers one).
    const meta = (tools[0]?._meta ?? {}) as Record<string, unknown>;
    expect(meta["openai/outputTemplate"]).toBeUndefined();
    expect(meta.ui).toBeUndefined();
  });

  it("enforces one-tool-per-view", () => {
    const server = new McpServer({ name: "t", version: "1.0.0" }, {});
    server.registerTool({ name: "a", view: view("shared") }, async () => ({
      content: "a",
    }));
    expect(() =>
      server.registerTool({ name: "b", view: view("shared") }, async () => ({
        content: "b",
      })),
    ).toThrow(/view "shared" is already used by tool "a"/);
  });

  it("injects a per-call viewUUID into the result _meta of view-backed tools", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool({ name: "v", view: view("poll") }, async () => ({
      content: "ok",
      structuredContent: {},
    }));

    const { client, close } = await connectModern(server);
    const first = await client.callTool({ name: "v", arguments: {} });
    const second = await client.callTool({ name: "v", arguments: {} });
    await close();

    const firstUuid = (first._meta as Record<string, unknown>)?.viewUUID;
    const secondUuid = (second._meta as Record<string, unknown>)?.viewUUID;
    expect(typeof firstUuid).toBe("string");
    expect(typeof secondUuid).toBe("string");
    // Fresh UUID per call.
    expect(firstUuid).not.toBe(secondUuid);
  });

  it("does not inject viewUUID for tools without a view", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "echo", inputSchema: z.object({ msg: z.string() }) },
      async ({ msg }) => ({ content: msg }),
    );

    const { client, close } = await connectModern(server);
    const result = await client.callTool({
      name: "echo",
      arguments: { msg: "hi" },
    });
    await close();

    expect((result._meta as Record<string, unknown>)?.viewUUID).toBeUndefined();
  });
});

describe("McpServer.registerTool — zero-input tools (#45)", () => {
  it("schema-less tools accept a call that omits `arguments` entirely", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "ping", outputSchema: z.object({ ok: z.boolean() }) },
      async () => ({ content: "pong", structuredContent: { ok: true } }),
    );

    const { handler, close } = await connectModern(server);
    // `tools/call` WITHOUT `params.arguments` — spec-legal, real hosts do it.
    // The client API can't express this, so send the raw modern wire.
    const { body } = await rpc(
      handler,
      "tools/call",
      { name: "ping" },
      { name: "ping" },
    );
    await close();

    expect(body.error).toBeUndefined();
    expect(body.result?.structuredContent).toEqual({ ok: true });
  });

  it("schema-less tools get args = {} and the real v2 ctx (not the SDK one-arg mixup)", async () => {
    let seenArgs: unknown = "unset";
    let seenCtx: unknown = "unset";
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool({ name: "whoami" }, async (args, ctx) => {
      seenArgs = args;
      seenCtx = ctx;
      return { content: "me" };
    });

    const { handler, close } = await connectModern(server);
    await rpc(handler, "tools/call", { name: "whoami" }, { name: "whoami" });
    await close();

    // The SDK's one-argument convention for schema-less tools would put `ctx`
    // in the `args` slot; the blueprint bridges it so `args` is always `{}`.
    expect(seenArgs).toEqual({});
    const ctx = seenCtx as { mcpReq?: { id?: unknown; signal?: unknown } };
    expect(ctx.mcpReq?.id).toBeDefined();
    expect(ctx.mcpReq?.signal).toBeInstanceOf(AbortSignal);
  });

  it("tools/list still advertises an object inputSchema for schema-less tools", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool({ name: "ping" }, async () => ({ content: "pong" }));

    const { client, close } = await connectModern(server);
    const { tools } = await client.listTools();
    await close();

    // Registering without a schema must be invisible on the wire: the SDK
    // falls back to the same empty object schema.
    expect(tools[0]?.inputSchema).toMatchObject({ type: "object" });
  });

  it("zero-input view-backed tools still get a viewUUID", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool({ name: "show", view: view("status") }, async () => ({
      content: "ok",
      structuredContent: {},
    }));

    const { handler, close } = await connectModern(server);
    const { body } = await rpc(
      handler,
      "tools/call",
      { name: "show" },
      { name: "show" },
    );
    await close();

    const meta = body.result?._meta as Record<string, unknown> | undefined;
    expect(typeof meta?.viewUUID).toBe("string");
  });
});

describe("McpServer — resources/list + resources/read", () => {
  it("(b) lists + reads both host-variant resources with shell HTML containing serverUrl/viewName", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "create_poll",
        description: "Create a poll",
        view: { component: "poll" as ViewName, description: "Poll view" },
      },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const { client, close } = await connectModern(server);

    const { resources } = await client.listResources();
    const appsSdk = resources.find((r) => r.uri.includes("apps-sdk"));
    const extApps = resources.find((r) => r.uri.includes("ext-apps"));
    expect(appsSdk?.uri).toBe("ui://views/apps-sdk/poll.html");
    expect(extApps?.uri).toBe("ui://views/ext-apps/poll.html");

    const appsSdkRead = await client.readResource({ uri: appsSdk?.uri ?? "" });
    const extAppsRead = await client.readResource({ uri: extApps?.uri ?? "" });
    await close();

    const appsSdkContent = appsSdkRead.contents[0] as {
      mimeType?: string;
      text?: string;
    };
    expect(appsSdkContent?.mimeType).toBe("text/html+skybridge");
    const appsSdkHtml = appsSdkContent?.text as string;
    // No host-identifying headers on the test transport → dev localhost fallback.
    expect(appsSdkHtml).toContain('hostType: "apps-sdk"');
    expect(appsSdkHtml).toContain("http://localhost:3000");
    expect(appsSdkHtml).toContain('viewName: "poll"');
    expect(appsSdkHtml).toContain('<div id="root"></div>');

    const extAppsContent = extAppsRead.contents[0] as {
      mimeType?: string;
      text?: string;
    };
    expect(extAppsContent?.mimeType).toBe("text/html;profile=mcp-app");
    expect(extAppsContent?.text as string).toContain('hostType: "mcp-app"');
  });

  it("(c) attaches CSP _meta to view resources at list time for both hosts", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "start",
        description: "Start",
        view: {
          component: "deck" as ViewName,
          description: "Onboarding deck",
          csp: {
            resourceDomains: ["https://fonts.googleapis.com"],
            connectDomains: ["https://api.example.com"],
          },
        },
      },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const { client, close } = await connectModern(server);
    const { resources } = await client.listResources();
    await close();

    const appsSdk = resources.find((r) => r.uri.includes("apps-sdk"));
    const extApps = resources.find((r) => r.uri.includes("ext-apps"));

    // apps-sdk CSP shape: snake_case `openai/widgetCSP`.
    const appsSdkCsp = (appsSdk?._meta as Record<string, unknown>)?.[
      "openai/widgetCSP"
    ] as { resource_domains?: string[]; connect_domains?: string[] };
    expect(appsSdkCsp.resource_domains).toContain(
      "https://fonts.googleapis.com",
    );
    expect(appsSdkCsp.resource_domains).toContain("http://localhost:3000");
    expect(appsSdkCsp.connect_domains).toContain("https://api.example.com");
    expect(
      (appsSdk?._meta as Record<string, unknown>)?.["openai/widgetDomain"],
    ).toBe("http://localhost:3000");

    // mcp-app CSP shape: camelCase under `ui.csp`.
    const extUi = (
      extApps?._meta as {
        ui?: {
          csp?: {
            connectDomains?: string[];
            resourceDomains?: string[];
            baseUriDomains?: string[];
          };
          domain?: string;
        };
      }
    ).ui;
    expect(extUi?.csp?.resourceDomains).toContain(
      "https://fonts.googleapis.com",
    );
    expect(extUi?.csp?.connectDomains).toContain("https://api.example.com");
    expect(extUi?.csp?.baseUriDomains).toContain("http://localhost:3000");
    expect(extUi?.domain).toBe("http://localhost:3000");
  });
});

describe("CSP / request-context resolution (wiring)", () => {
  /** List the ext-apps view resource `_meta` with the given HTTP headers. */
  async function listExtAppsMeta(
    // biome-ignore lint/suspicious/noExplicitAny: tests accept any tool registry
    server: McpServer<any>,
    headers: Record<string, string>,
  ) {
    const { client, close } = await connectModern(server, headers);
    const { resources } = await client.listResources();
    await close();
    const extApps = resources.find((r) => r.uri.includes("ext-apps"));
    expect(extApps).toBeDefined();
    return extApps?._meta as Record<string, unknown> | undefined;
  }

  it("derives serverUrl from x-forwarded-host and hashes the Claude content domain", async () => {
    process.env.NODE_ENV = "production";
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "v",
        view: { component: "claude-view" as ViewName, description: "d" },
      },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const forwardedHost = "tunnel.example.com";
    const serverUrl = `https://${forwardedHost}`;
    // The Claude content domain hashes `${serverUrl}${pathname}` — the test
    // transport posts to `/mcp`, matching a real host connector URL.
    const expectedDomain = `${crypto
      .createHash("sha256")
      .update(`${serverUrl}/mcp`)
      .digest("hex")
      .slice(0, 32)}.claudemcpcontent.com`;

    const meta = (await listExtAppsMeta(server, {
      "user-agent": "Claude-User",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": "https",
    })) as { ui?: { domain?: string; csp?: { connectDomains?: string[] } } };

    expect(meta?.ui?.domain).toBe(expectedDomain);
    // serverUrl is derived from x-forwarded-host (https) — assert CSP picked it.
    expect(meta?.ui?.csp?.connectDomains).toContain(serverUrl);
  });

  it("derives serverUrl from the cloudflared tunnel x-forwarded-host", async () => {
    // cloudflared forwards the public quick-tunnel host on `x-forwarded-host`
    // (and `https` on `x-forwarded-proto`). The view request context must build
    // `serverUrl` from that header, not the local loopback `host`.
    process.env.NODE_ENV = "production";
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "v",
        view: { component: "tunnel-view" as ViewName, description: "d" },
      },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const tunnelHost = "abc-def-123.trycloudflare.com";
    const expectedServerUrl = `https://${tunnelHost}`;

    const meta = (await listExtAppsMeta(server, {
      // No Claude-User agent: isolates serverUrl derivation from domain hashing.
      "x-forwarded-host": tunnelHost,
      "x-forwarded-proto": "https",
      host: "127.0.0.1:3000",
    })) as {
      ui?: { csp?: { connectDomains?: string[]; resourceDomains?: string[] } };
    };

    expect(meta?.ui?.csp?.connectDomains).toContain(expectedServerUrl);
    expect(meta?.ui?.csp?.resourceDomains).toContain(expectedServerUrl);
  });
});

describe("view URI versioning", () => {
  it("versions view URIs with a content hash in production", async () => {
    process.env.NODE_ENV = "production";
    const manifest = new InMemoryViewManifest("main-ABC123.js", "styles-X.css");
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {}, viewManifest: manifest },
    ).registerTool(
      { name: "v", view: { component: "poll" as ViewName } },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const expected = `?v=${crypto
      .createHash("sha256")
      .update("main-ABC123.js")
      .update("\0")
      .update("styles-X.css")
      .digest("hex")
      .slice(0, 8)}`;

    const { client, close } = await connectModern(server);
    const { resources } = await client.listResources();
    await close();

    const uris = resources.map((r) => r.uri);
    expect(uris).toContain(`ui://views/apps-sdk/poll.html${expected}`);
    expect(uris).toContain(`ui://views/ext-apps/poll.html${expected}`);
  });

  it("still versions in production when styleFile() throws but mainFile() resolves", async () => {
    process.env.NODE_ENV = "production";
    // A manifest where the style read throws (e.g. critical-CSS inlined, no
    // global stylesheet) must not discard the resolved mainFile and disable
    // cache-busting — the version param hashes mainFile + "" (empty style).
    const manifest: ViewManifest = {
      mainFile: () => "main-ONLY.js",
      styleFile: () => {
        throw new Error("no global stylesheet");
      },
    };
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {}, viewManifest: manifest },
    ).registerTool(
      { name: "v", view: { component: "poll" as ViewName } },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const expected = `?v=${crypto
      .createHash("sha256")
      .update("main-ONLY.js")
      .update("\0")
      .digest("hex")
      .slice(0, 8)}`;

    const { client, close } = await connectModern(server);
    const { resources } = await client.listResources();
    await close();

    expect(resources.map((r) => r.uri)).toContain(
      `ui://views/apps-sdk/poll.html${expected}`,
    );
  });

  it("does not version view URIs in development", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "v", view: { component: "poll" as ViewName } },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const { client, close } = await connectModern(server);
    const { resources } = await client.listResources();
    await close();

    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("ui://views/apps-sdk/poll.html");
    expect(uris).toContain("ui://views/ext-apps/poll.html");
  });
});

describe("2026-07-28 wire surface", () => {
  it("list results carry cache hints and rejects a bare 2025-era request", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool({ name: "ping" }, async () => ({ content: "pong" }));

    const { handler, close } = await connectModern(server);

    // Modern list result: SEP-2549 cache fields present.
    const list = await rpc(handler, "tools/list");
    expect(list.body.result?.ttlMs).toBeDefined();
    expect(list.body.result?.cacheScope).toBeDefined();

    // 1.x wire policy: `legacy: 'reject'` — a bare 2025-era body (no modern
    // envelope, no routing headers) is refused with the
    // unsupported-protocol-version error, not served.
    const bare = await handler.fetch(
      new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    await close();

    expect(bare.status).toBe(400);
    const bareBody = (await bare.json()) as {
      error?: { code: number; data?: { supported?: string[] } };
    };
    expect(bareBody.error).toBeDefined();
    expect(bareBody.error?.data?.supported).toEqual(["2026-07-28"]);
  });
});
