// HTTP integration for the MCP server blueprint (1.x, SDK v2).
//
// Two faces over the same per-request factory:
//   * `createMcpFetchHandler(server)` — the web-standards `McpHttpHandler`
//     (`fetch(Request) => Promise<Response>`) for edge runtimes (Vercel,
//     workerd) or custom hosting.
//   * `createMcpExpressRouter(server)` — a mountable `express.Router` for the
//     Angular SSR `server.ts`, mounted under `/mcp` *before* the Angular
//     catch-all:
//
//       app.use("/mcp", createMcpExpressRouter(mcp));
//
// Wire policy (1.x): `legacy: 'reject'` — this endpoint speaks MCP 2026-07-28
// only. 2025-era clients receive the unsupported-protocol-version error; users
// who need the old protocol stay on the 0.2.x line.
//
// What the express router does:
//   * builds one `createMcpHandler` (fresh SDK server per request via
//     `McpServer.factory()`) and adapts it with `toNodeHandler`
//   * restores `req.url = req.originalUrl` so the adapter sees the full path
//     (Express strips the mount path) — needed for Claude domain hashing
//   * forwards `req.body` as the pre-parsed body when `express.json()` ran
//     upstream (the adapter streams the raw body otherwise)
//   * defaults a missing `params.arguments` to `{}` on `tools/call` (#45)
//   * routes ALL verbs to the SDK handler — modern-era verb semantics
//     (POST JSON-RPC, `subscriptions/listen` SSE streams) are the SDK's job
//   * thrown errors → the optional `errorMiddleware`, then the default
//     JSON-RPC 500 error handler

import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  type CreateMcpHandlerOptions,
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { McpServer } from "./server.js";

/** A JSON-RPC 2.0 error body with a null id (no request context to echo). */
function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, error: { code, message }, id: null };
}

/**
 * Default a missing `params.arguments` to `{}` on `tools/call` messages
 * (mutates `body` in place; tolerates single messages and arrays).
 *
 * The MCP spec allows hosts to omit `arguments` entirely — and real hosts do —
 * but schema validation of `undefined` against an object schema fails, so any
 * tool registered with an input schema would reject such calls with `-32602`
 * (#45). Defaulting here keeps hosts that omit `arguments` working for every
 * schema shape.
 */
function normalizeToolCallArguments(body: unknown): void {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      continue;
    }
    const { method, params } = message as {
      method?: unknown;
      params?: { arguments?: unknown };
    };
    if (
      method !== "tools/call" ||
      typeof params !== "object" ||
      params === null
    ) {
      continue;
    }
    // Strictly `undefined` (absent key): an explicit `"arguments": null` is
    // invalid per spec and must keep surfacing the SDK's -32602, not be
    // silently coerced to `{}`.
    if (params.arguments === undefined) {
      params.arguments = {};
    }
  }
}

/**
 * The default error handler appended after the route handler. Logs, then
 * returns a JSON-RPC `-32603` "Internal server error" with HTTP 500 (unless
 * headers were already sent).
 */
const defaultErrorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // `next` must be declared (4-arg arity) for Express to treat this as an
  // error handler, even though we don't forward.
  _next: NextFunction,
) => {
  console.error("Error handling MCP request:", err);
  if (!res.headersSent) {
    res.status(500).json(jsonRpcError(-32603, "Internal server error"));
  }
};

/** Options for {@link createMcpFetchHandler}. */
export interface CreateMcpFetchHandlerOptions
  extends Omit<CreateMcpHandlerOptions, "legacy"> {}

/**
 * Build the web-standards MCP handler for `server`: a fresh SDK server per
 * request via {@link McpServer.factory}, speaking MCP 2026-07-28 only
 * (`legacy: 'reject'`). Use this directly on fetch-native runtimes; Node/
 * Express consumers want {@link createMcpExpressRouter}.
 */
export function createMcpFetchHandler(
  // biome-ignore lint/suspicious/noExplicitAny: any tool registry is acceptable at the transport boundary
  server: McpServer<any>,
  options: CreateMcpFetchHandlerOptions = {},
): McpHttpHandler {
  return createMcpHandler(server.factory(), { ...options, legacy: "reject" });
}

/** Options for {@link createMcpExpressRouter}. */
export interface CreateMcpExpressRouterOptions {
  /**
   * Apply a permissive CORS layer to the router. The MCP endpoint is fetched
   * cross-origin by hosts (Claude/ChatGPT) and module-script CORS rules apply,
   * so this defaults to `true`. Set `false` if the host app already manages
   * CORS for this mount path.
   */
  cors?: boolean;
  /**
   * Express error handlers to run *before* the built-in default JSON-RPC error
   * handler, scoped to this router. Use to log or transform errors thrown by
   * the handler adaptation. A handler that responds short-circuits the
   * default; a handler that calls `next(err)` falls through to the default 500.
   */
  errorMiddleware?: ErrorRequestHandler[];
  /**
   * Reporting callback for out-of-band errors and rejected requests inside the
   * SDK handler (it never alters the response).
   */
  onerror?: (error: Error) => void;
  /**
   * Advanced pass-through to the SDK's `createMcpHandler` (response mode,
   * subscriptions bus, keep-alive). `legacy` is pinned to `'reject'` by the
   * 1.x wire policy and cannot be overridden here.
   */
  handlerOptions?: Omit<CreateMcpHandlerOptions, "legacy" | "onerror">;
}

/**
 * The router {@link createMcpExpressRouter} returns: a mountable
 * `express.Router` that also exposes the underlying SDK handler as `mcp`, so
 * server code can publish `subscriptions/listen` change events
 * (`router.mcp.notify.*`) or share its `bus` without holding a separate
 * fetch-handler instance.
 */
export type McpExpressRouter = express.Router & { mcp: McpHttpHandler };

/**
 * Build a mountable Express {@link express.Router} that serves the MCP
 * endpoint for `server`. Mount it on the path the host connects to:
 *
 * ```ts
 * import express from "express";
 * import { createMcpExpressRouter } from "ng-mcp-ui/server";
 *
 * const app = express();
 * app.use(express.json());              // recommended: pre-parsed JSON bodies
 * app.use("/mcp", createMcpExpressRouter(mcp));
 * ```
 *
 * Every verb is forwarded to the SDK handler (modern-era verb semantics —
 * single JSON bodies, `subscriptions/listen` SSE — are owned by the SDK).
 * 2025-era clients are rejected (`legacy: 'reject'`).
 */
export function createMcpExpressRouter(
  // biome-ignore lint/suspicious/noExplicitAny: any tool registry is acceptable at the transport boundary
  server: McpServer<any>,
  options: CreateMcpExpressRouterOptions = {},
): McpExpressRouter {
  const {
    cors: enableCors = true,
    errorMiddleware = [],
    onerror,
    handlerOptions = {},
  } = options;

  const handler = createMcpFetchHandler(server, { ...handlerOptions, onerror });
  const nodeHandler = toNodeHandler(handler, { onerror });

  const router = express.Router();

  if (enableCors) {
    router.use(cors());
  }

  router.all("/", (req: Request, res: Response, next: NextFunction) => {
    // Express strips the mount path from req.url (e.g. "/mcp" becomes "/").
    // Restore it so the adapter builds the correct web Request URL, which
    // Claude domain hashing relies on.
    req.url = req.originalUrl;
    normalizeToolCallArguments(req.body);
    nodeHandler(req, res, req.body).catch(next);
  });

  for (const middleware of errorMiddleware) {
    router.use(middleware);
  }
  router.use(defaultErrorHandler);

  return Object.assign(router, { mcp: handler });
}
