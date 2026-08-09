// Express auth helpers for the MCP router.
//
// These are thin re-exports of the MCP SDK v2 Express auth helpers
// (`@modelcontextprotocol/express`) plus one convenience wrapper
// (`optionalBearerAuth`). They are express-level `RequestHandler`s, so they
// slot in naturally around `createMcpExpressRouter`: mount
// `requireBearerAuth(...)` / `optionalBearerAuth(...)` on the host app before
// the MCP router so an unauthenticated request is rejected before it reaches
// the handler. `requireBearerAuth` attaches the verified `AuthInfo` to
// `req.auth`, which the SDK's `toNodeHandler` forwards to tool handlers as
// `ctx.http.authInfo`.
//
// 1.x note: the v1 `InvalidTokenError` re-export is gone — SDK v2 reports
// bearer failures through its own OAuth error responses; there is no
// error-class surface to re-export.

import {
  type AuthMetadataOptions,
  type BearerAuthMiddlewareOptions,
  mcpAuthMetadataRouter,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { RequestHandler } from "express";

export {
  type AuthMetadataOptions,
  type BearerAuthMiddlewareOptions,
  mcpAuthMetadataRouter,
  requireBearerAuth,
};
export type { AuthInfo };

/**
 * Like `requireBearerAuth`, but lets requests through when no
 * `Authorization` header is present. Used for mixed-auth servers where some
 * tools are public and others require sign-in: each tool enforces its own
 * `securitySchemes` against `ctx.http?.authInfo`.
 *
 * Behavior:
 * - No `Authorization` header → `next()` without `req.auth`.
 * - Valid Bearer token → `req.auth` set, same as `requireBearerAuth`.
 * - Invalid / malformed / expired / insufficient-scope → same error response
 *   as `requireBearerAuth` (401/403). Sending a bad token is still a client
 *   error.
 */
export function optionalBearerAuth(
  options: BearerAuthMiddlewareOptions,
): RequestHandler {
  const required = requireBearerAuth(options);
  return (req, res, next) => {
    if (!req.headers.authorization) {
      next();
      return;
    }
    return required(req, res, next);
  };
}
