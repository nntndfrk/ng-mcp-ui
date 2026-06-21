// Express integration for the MCP server.
//
// PLAN §3 key change: rather than owning the HTTP server, we expose a
// **mountable `express.Router`** so an Angular `server.ts` can mount it under
// `/mcp` *before* the Angular SSR catch-all (PLAN §3):
//
//   app.use("/mcp", createMcpExpressRouter(mcp));
//
// What the `/mcp` express handler does:
//   * per-request fresh stateless transport via `connectStatelessTransport`
//   * `StreamableHTTPServerTransport({ sessionIdGenerator: undefined,
//     enableJsonResponse: true })` — single JSON body, never SSE
//   * `res.on("close", () => transport.close())`
//   * restore `req.url = req.originalUrl` so the SDK sees the full path
//     (Express strips the mount path) — needed by `resolveViewRequestContext`
//   * non-POST → 405 JSON-RPC error (`GET`/`DELETE`/etc. are all rejected)
//   * thrown errors → `next(error)` → the default JSON-RPC 500 error handler
//
// What's intentionally OUT OF SCOPE here (each handled elsewhere):
//   * dev-only devtools + `viewsDevServer` + tunnel-proxy wiring →
//     not the router's job; the dev-server proxy lands in S06, tunnel later.
//   * `/assets` static serving → S06 `createViewAssetRouter()`.
//   * `app.listen` / Vercel / workerd branches → the consumer owns the server.
//   * a `server.express` field + whole-app middleware → the consumer mounts
//     their own middleware around this router; an optional `errorMiddleware`
//     hook keeps error handling scoped to this path.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
 * The default error handler appended after the `/` (POST) handler. Logs, then
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
   * the stateless transport / tool handlers. A handler that responds
   * short-circuits the default; a handler that calls `next(err)` falls through
   * to the default 500.
   */
  errorMiddleware?: ErrorRequestHandler[];
}

/**
 * Build a mountable Express {@link express.Router} that serves the MCP JSON-RPC
 * endpoint for `server`. Mount it on the path the host connects to:
 *
 * ```ts
 * import express from "express";
 * import { createMcpExpressRouter } from "ng-mcp-ui/server";
 *
 * const app = express();
 * app.use(express.json());              // required: the handler reads req.body
 * app.use("/mcp", createMcpExpressRouter(mcp));
 * ```
 *
 * Semantics of the `/mcp` handler:
 * - `POST` → a fresh per-request stateless `StreamableHTTPServerTransport`
 *   (`enableJsonResponse: true`) connected via
 *   {@link McpServer.connectStatelessTransport}; responds with a single JSON
 *   body. Concurrency-safe because each request gets its own transport +
 *   underlying `Server` sharing the main handler maps.
 * - any other method (`GET`/`DELETE`/…) → HTTP 405 with a JSON-RPC `-32000`
 *   "Method not allowed." body.
 * - thrown errors → the optional `errorMiddleware`, then the default 500
 *   JSON-RPC error handler.
 *
 * NOTE: the caller must apply `express.json()` upstream; the transport reads
 * `req.body`.
 */
export function createMcpExpressRouter(
  server: McpServer,
  options: CreateMcpExpressRouterOptions = {},
): express.Router {
  const { cors: enableCors = true, errorMiddleware = [] } = options;
  const router = express.Router();

  if (enableCors) {
    router.use(cors());
  }

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        // Respond with a single JSON body instead of SSE. The stateless
        // transport never streams server-initiated messages, so SSE adds no
        // capability here.
        enableJsonResponse: true,
      });

      res.on("close", () => {
        transport.close();
      });

      await server.connectStatelessTransport(transport);
      // Express strips the mount path from req.url (e.g. "/mcp" becomes "/").
      // Restore it so the SDK builds the correct requestInfo.url, which
      // `resolveViewRequestContext` relies on for Claude domain hashing.
      req.url = req.originalUrl;
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });

  // Any non-POST verb on the MCP endpoint → 405 JSON-RPC error. On a Router we
  // register the catch-all `all` route after `post` so GET/DELETE/PUT/PATCH all
  // land here.
  router.all("/", (_req: Request, res: Response) => {
    res.status(405).json(jsonRpcError(-32000, "Method not allowed."));
  });

  for (const handler of errorMiddleware) {
    router.use(handler);
  }
  router.use(defaultErrorHandler);

  return router;
}
