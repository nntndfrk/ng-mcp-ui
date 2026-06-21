import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import * as z from "zod";
import { McpServer } from "./server.js";
import type { ViewName } from "./types.js";
import { InMemoryViewManifest } from "./view-manifest.js";

// `ViewName` is narrowed to `never` until a `ViewNameRegistry` augmentation
// exists, so test view component names are cast.
const view = (component: string) => ({ component: component as ViewName });

function resetEnv() {
  delete process.env.NODE_ENV;
}

afterEach(resetEnv);

/** Connect a client to the server over a linked in-memory transport pair. */
async function connect(server: McpServer) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

describe("McpServer.registerTool — tools/list", () => {
  it("(a) exposes the tool with view _meta (outputTemplate + ui.resourceUri)", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      {
        name: "create_poll",
        description: "Create a poll",
        inputSchema: { question: z.string() },
        view: { component: "poll" as ViewName, description: "Poll view" },
      },
      async ({ question }) => ({
        content: `Poll: ${question}`,
        structuredContent: { question },
      }),
    );

    const { client, close } = await connect(server);
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

  it("registers a plain tool with no view (no resources)", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "echo", inputSchema: { msg: z.string() } },
      async ({ msg }) => ({ content: msg, structuredContent: { msg } }),
    );

    const { client, close } = await connect(server);
    const { tools } = await client.listTools();
    await close();

    expect(tools).toHaveLength(1);
    // No view → no resource registered. The SDK only advertises the resources
    // capability once a resource exists, so `_registeredResources` is empty.
    // biome-ignore lint/suspicious/noExplicitAny: read internal registered resource map
    const registered = (server as any)._registeredResources as Record<
      string,
      unknown
    >;
    expect(Object.keys(registered)).toHaveLength(0);
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
    ).registerTool(
      { name: "v", view: view("poll") },
      async () => ({ content: "ok", structuredContent: {} }),
    );

    const { client, close } = await connect(server);
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
    ).registerTool({ name: "echo", inputSchema: { msg: z.string() } }, async ({
      msg,
    }) => ({ content: msg }));

    const { client, close } = await connect(server);
    const result = await client.callTool({
      name: "echo",
      arguments: { msg: "hi" },
    });
    await close();

    expect((result._meta as Record<string, unknown>)?.viewUUID).toBeUndefined();
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

    const { client, close } = await connect(server);

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
    // No host headers on the in-memory transport → dev localhost fallback.
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

    const { client, close } = await connect(server);
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
  /** Read the registered ext-apps resource callback directly with synthetic headers. */
  async function readExtAppsMeta(
    server: McpServer,
    headers: Record<string, string>,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: reach the internal registered-resource map for a focused handler test
    const registered = (server as any)._registeredResources as Record<
      string,
      {
        readCallback: (
          uri: URL,
          extra: unknown,
        ) => Promise<{ contents: Array<{ _meta?: Record<string, unknown> }> }>;
      }
    >;
    const extUri = Object.keys(registered).find((u) => u.includes("ext-apps"));
    expect(extUri).toBeDefined();
    const result = await registered[extUri ?? ""]?.readCallback(
      new URL(extUri ?? ""),
      { requestInfo: { headers } },
    );
    return result?.contents[0]?._meta;
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
    const expectedDomain = `${crypto
      .createHash("sha256")
      .update(serverUrl)
      .digest("hex")
      .slice(0, 32)}.claudemcpcontent.com`;

    const meta = (await readExtAppsMeta(server, {
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

    const meta = (await readExtAppsMeta(server, {
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
  it("versions view URIs with a content hash in production", () => {
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

    // biome-ignore lint/suspicious/noExplicitAny: read internal registered resource uris
    const registered = (server as any)._registeredResources as Record<
      string,
      unknown
    >;
    const uris = Object.keys(registered);
    expect(
      uris.some((u) => u === `ui://views/apps-sdk/poll.html${expected}`),
    ).toBe(true);
    expect(
      uris.some((u) => u === `ui://views/ext-apps/poll.html${expected}`),
    ).toBe(true);
  });

  it("does not version view URIs in development", () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    ).registerTool(
      { name: "v", view: { component: "poll" as ViewName } },
      async () => ({ content: "ok", structuredContent: {} }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: read internal registered resource uris
    const registered = (server as any)._registeredResources as Record<
      string,
      unknown
    >;
    expect(Object.keys(registered)).toContain("ui://views/apps-sdk/poll.html");
    expect(Object.keys(registered)).toContain("ui://views/ext-apps/poll.html");
  });
});

describe("mcpMiddleware lifecycle", () => {
  it("throws when registered after connect()", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: {} },
    );
    const { close } = await connect(server);
    expect(() =>
      server.mcpMiddleware("tools/call", (_req, _extra, next) => next()),
    ).toThrow(/Cannot register MCP middleware after/);
    await close();
  });
});
