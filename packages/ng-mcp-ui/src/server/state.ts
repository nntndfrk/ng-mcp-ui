// Sealed state: the requestState x view-state "weave" (Phase 2, see
// .claude/REQUEST-STATE-DESIGN.md).
//
// One HMAC codec, configured once on the blueprint via
// `McpServerExtraOptions.state`, upgrades BOTH verified state carriers of the
// 2026-07-28 protocol:
//   1. MRTR `requestState`: the codec's `verify` is wired into the per-request
//      SDK `ServerOptions.requestState.verify`, so echoed state is
//      integrity-checked before any handler runs and
//      `ctx.mcpReq.requestState<T>()` returns the decoded payload.
//   2. Sealed view state: handlers get `ctx.state.seal()` / `ctx.state.open()`
//      to round-trip app state through the widget. The token rides tool
//      results in `_meta[STATE_META_KEY]`, is persisted by the widget in host
//      view state (`injectViewState`), and comes back as an ordinary tool
//      argument on view-to-server calls. The server stays stateless.
//
// The codec is signed, not encrypted: payloads are client-readable. Never put
// secrets in sealed state.

import crypto from "node:crypto";
import {
  createRequestStateCodec,
  type RequestStateCodec,
  type ServerContext,
} from "@modelcontextprotocol/server";

// Re-export the SDK's MRTR surface so 1.x consumers never import
// `@modelcontextprotocol/server` directly (same policy as `auth.ts`).
export {
  acceptedContent,
  createRequestStateCodec,
  type InputRequest,
  type InputRequests,
  type InputRequiredResult,
  type InputResponses,
  type InputResponseView,
  inputRequired,
  inputResponse,
  type RequestStateCodec,
} from "@modelcontextprotocol/server";

/**
 * The tool-result `_meta` key that carries a sealed-state token to the widget.
 * `_meta` reaches widgets as `toolResponseMetadata` on both bridges but is not
 * model-visible, so the token costs no model context.
 */
export const STATE_META_KEY = "ng-mcp-ui/state";

/**
 * The stable message of the error {@link SealedState.open} throws on a bad,
 * expired, or foreign token. For tools the SDK converts the throw into an
 * `isError: true` result carrying this text, so widgets can detect an expired
 * token and re-render accordingly. The underlying opaque reason code is kept
 * on the error's `cause`.
 */
export const SEALED_STATE_INVALID_MESSAGE =
  "ng-mcp-ui: sealed state is invalid or expired";

/**
 * Blueprint-level sealed-state configuration, mirroring the SDK's
 * `RequestStateCodecOptions` with an optional `key` for dev ergonomics.
 */
export interface StateOptions {
  /**
   * The HMAC secret, at least 32 bytes (a string is UTF-8 encoded). Required
   * in production (`NODE_ENV === "production"`); in development an omitted
   * key falls back to an ephemeral per-process key with a console warning,
   * so tokens die on restart (fine for `ng serve`).
   *
   * The same key must be available to every server instance that may receive
   * a token, so multi-instance deployments need a shared secret.
   */
  key?: string | Uint8Array;
  /**
   * Token lifetime in seconds. Applies to both MRTR echoes and sealed view
   * state. Defaults to the SDK codec's 600 (ten minutes); view-carried state
   * usually wants a much longer horizon (hours).
   */
  ttlSeconds?: number;
  /**
   * Optional context binding, passed through to the SDK codec. CAUTION: a
   * token verifies in a DIFFERENT request than the one that minted it, so
   * the binding must be stable across requests and methods. Bind by
   * principal (`ctx.http?.authInfo?.clientId`), never by
   * `ctx.mcpReq.method`.
   */
  bind?: (ctx: ServerContext) => string;
}

/**
 * Handler-facing sealed-state helpers, available as `ctx.state` when the
 * blueprint was constructed with a `state` option. `seal`/`open` delegate to
 * the underlying SDK codec's `mint`/`verify` with the current request context.
 */
export interface SealedState {
  /** Seal a JSON-serializable payload into an opaque token. */
  seal<T>(payload: T): Promise<string>;
  /**
   * Verify a token and return its payload. Throws an `Error` whose message
   * is {@link SEALED_STATE_INVALID_MESSAGE} on any failure (bad MAC,
   * expired, bind mismatch, malformed). The type parameter is a
   * compile-time cast only.
   */
  open<T>(token: string): Promise<T>;
}

/** @internal Structural check: a ready-made codec vs. plain options. */
function isCodec(
  state: StateOptions | RequestStateCodec,
): state is RequestStateCodec {
  return (
    typeof (state as RequestStateCodec).mint === "function" &&
    typeof (state as RequestStateCodec).verify === "function"
  );
}

/**
 * @internal
 * Resolve the blueprint's `state` option into a codec. A passed-in codec is
 * used as-is (the escape hatch for AEAD or external key management). Options
 * without a `key` throw in production and mint an ephemeral per-process key
 * with a warning in development.
 */
export function resolveStateCodec(
  state: StateOptions | RequestStateCodec | undefined,
): RequestStateCodec | undefined {
  if (state === undefined) {
    return undefined;
  }
  if (isCodec(state)) {
    return state;
  }
  let key = state.key;
  if (key === undefined) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ng-mcp-ui: `state.key` is required in production. Provide a stable " +
          "secret of at least 32 bytes (for example from an environment " +
          "variable) so sealed state survives restarts and is shared across " +
          "instances.",
      );
    }
    console.warn(
      "ng-mcp-ui: no `state.key` configured; using an ephemeral per-process " +
        "key. Sealed state will not survive a server restart. Set " +
        "`state.key` before deploying.",
    );
    key = crypto.randomBytes(32);
  }
  return createRequestStateCodec({
    key,
    ...(state.ttlSeconds !== undefined && { ttlSeconds: state.ttlSeconds }),
    ...(state.bind !== undefined && { bind: state.bind }),
  });
}

/**
 * @internal
 * Bind a codec to one request's context, producing the `ctx.state` surface.
 * `open` failures are wrapped in the stable {@link SEALED_STATE_INVALID_MESSAGE}
 * error (the SDK turns a throwing tool callback into an `isError` result with
 * the message text); the codec's opaque reason code stays on `cause`.
 */
export function createSealedState(
  codec: RequestStateCodec,
  ctx: ServerContext,
): SealedState {
  return {
    seal: (payload) => codec.mint(payload, ctx),
    open: async <T>(token: string): Promise<T> => {
      try {
        return (await codec.verify(token, ctx)) as T;
      } catch (cause) {
        throw new Error(SEALED_STATE_INVALID_MESSAGE, { cause });
      }
    },
  };
}
