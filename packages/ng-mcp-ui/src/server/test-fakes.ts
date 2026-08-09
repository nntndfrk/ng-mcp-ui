// Non-shipping test helpers for the server suites (excluded from the ngc emit
// via the tsconfig `**/test-fakes.ts` exclude, same convention as the web
// entry's test-fakes).
//
// Two ways to speak MCP 2026-07-28 to a blueprint under test:
//   * `connectModern(server)` — the real v2 `Client` wired to the blueprint's
//     fetch handler via a custom `fetch`. Spec-correct envelopes/headers for
//     free; use for flows the client API can express.
//   * `modernBody` / `modernHeaders` + `rpc()` — hand-stamped modern wire for
//     raw-request cases the client cannot express (e.g. `tools/call` with the
//     `arguments` key absent, #45) and for supertest-based router tests.

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  type McpHttpHandler,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { createMcpFetchHandler } from "./express.js";
import type { McpServer } from "./server.js";

export const MODERN_PROTOCOL_VERSION = "2026-07-28";

/** The per-request `_meta` envelope every 2026-07-28 request must carry. */
export const MODERN_ENVELOPE = {
  [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
  [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
} as const;

/** A JSON-RPC request body with the modern `_meta` envelope merged into params. */
export function modernBody(
  method: string,
  params: Record<string, unknown> = {},
  id: number | string = 1,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method,
    params: {
      ...params,
      _meta: { ...MODERN_ENVELOPE, ...(params._meta as object) },
    },
  };
}

/** The mandatory modern routing headers (SEP-2243). */
export function modernHeaders(
  method: string,
  name?: string,
): Record<string, string> {
  return {
    "Mcp-Method": method,
    ...(name !== undefined && { "Mcp-Name": name }),
  };
}

/**
 * Derive the mandatory `Mcp-Name` value for a request: the SDK requires the
 * header to mirror `params.name` / `params.uri` whenever the body carries one.
 */
function nameFor(params: Record<string, unknown>): string | undefined {
  if (typeof params.name === "string") {
    return params.name;
  }
  if (typeof params.uri === "string") {
    return params.uri;
  }
  return undefined;
}

/** Send one raw modern-wire request to a fetch handler and parse the JSON body. */
export async function rpc(
  handler: McpHttpHandler,
  method: string,
  params: Record<string, unknown> = {},
  options: {
    name?: string;
    headers?: Record<string, string>;
    id?: number;
  } = {},
) {
  const res = await handler.fetch(
    new Request("http://localhost:3000/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...modernHeaders(method, options.name ?? nameFor(params)),
        ...options.headers,
      },
      body: JSON.stringify(modernBody(method, params, options.id ?? 1)),
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as {
      jsonrpc: "2.0";
      id: number | string | null;
      result?: Record<string, unknown>;
      error?: { code: number; message: string };
    },
  };
}

/**
 * Connect a real v2 client to the blueprint's modern-only fetch handler.
 * `headers` are stamped on every HTTP request (via the transport's
 * `requestInit`) — the seam for exercising the request-context resolution
 * (`x-forwarded-host`, Claude user-agent, ...).
 */
export async function connectModern(
  // biome-ignore lint/suspicious/noExplicitAny: tests accept any tool registry
  server: McpServer<any>,
  headers?: Record<string, string>,
) {
  const handler = createMcpFetchHandler(server);
  // Pin the modern era: the v2 client's default posture is legacy (nothing
  // puts a 2026-07-28 byte on the wire by default), which a reject-mode
  // handler refuses.
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/mcp"),
    {
      fetch: (url: string | URL, init?: RequestInit) =>
        handler.fetch(new Request(url, init)),
      ...(headers && { requestInit: { headers } }),
    },
  );
  await client.connect(transport);
  return {
    client,
    handler,
    async close() {
      await client.close();
      await handler.close();
    },
  };
}
