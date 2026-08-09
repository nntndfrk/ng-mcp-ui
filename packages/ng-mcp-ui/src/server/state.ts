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
//
// The two carriers are domain-separated inside the signed envelope. Every
// token records the purpose it was minted for, and MRTR tokens additionally
// record the tool the flow started in, so a view token can never be replayed
// as `requestState` (or the reverse) and an MRTR echo cannot be moved to a
// different tool. Both checks are inside the MAC, so a client cannot alter
// them.

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
 * blueprint was constructed with a `state` option. Each method delegates to
 * the underlying SDK codec's `mint`/`verify` with the current request context,
 * adding the purpose (and, for MRTR, the operation) binding.
 *
 * Two carriers, two pairs:
 *   * `seal` / `open` for state a widget carries between tool calls.
 *   * `sealRequestState` / `requestState` for MRTR round trips.
 *
 * Tokens are not interchangeable between the pairs.
 */
export interface SealedState {
  /** Seal a JSON-serializable payload into an opaque widget-carried token. */
  seal<T>(payload: T): Promise<string>;
  /**
   * Verify a widget-carried token and return its payload. Throws an `Error`
   * whose message is {@link SEALED_STATE_INVALID_MESSAGE} on any failure (bad
   * MAC, expired, bind mismatch, malformed, or a token minted for a different
   * purpose). The type parameter is a compile-time cast only.
   */
  open<T>(token: string): Promise<T>;
  /**
   * Seal a payload as the `requestState` of an MRTR `inputRequired(...)`
   * return. The token is bound to the tool that mints it, so the client can
   * only echo it back into the same tool.
   */
  sealRequestState<T>(payload: T): Promise<string>;
  /**
   * Read the payload of a verified MRTR echo on a retry round, or `undefined`
   * when this round carried no state. Integrity was already checked by the
   * `requestState.verify` seam before the handler ran; this unwraps the
   * envelope and enforces the operation binding. Throws the
   * {@link SEALED_STATE_INVALID_MESSAGE} error when the echo belongs to a
   * different tool.
   *
   * Use this instead of the SDK's `ctx.mcpReq.requestState<T>()`, which
   * returns the raw signed envelope when a `state` option is configured.
   */
  requestState<T>(): T | undefined;
}

/**
 * @internal
 * The signed envelope every ng-mcp-ui token carries. Keys are single letters
 * because the token rides every call in both directions.
 */
type SealedEnvelope = {
  /** Purpose: `"v"` widget-carried view state, `"r"` MRTR request state. */
  p: "v" | "r";
  /** The caller's payload. */
  d: unknown;
  /** MRTR only: the tool the flow started in. */
  o?: string;
};

/** @internal Structural check for our own envelope shape and purpose. */
function isEnvelope(
  value: unknown,
  purpose: SealedEnvelope["p"],
): value is SealedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SealedEnvelope).p === purpose
  );
}

/**
 * @internal
 * Unwrap a decoded MRTR envelope for `operation`, throwing the stable error
 * when the purpose or the operation binding does not match. Exported for the
 * `requestState.verify` seam in `server.ts`, which runs before any handler.
 */
export function assertRequestStateEnvelope(
  value: unknown,
): asserts value is SealedEnvelope {
  if (!isEnvelope(value, "r")) {
    throw new Error(SEALED_STATE_INVALID_MESSAGE);
  }
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
 * Bind a codec to one request's context and one tool, producing the
 * `ctx.state` surface. `operation` is the registered tool name; it is sealed
 * into MRTR tokens and checked when they come back, so an echo cannot be moved
 * to another tool.
 *
 * `open` failures are wrapped in the stable {@link SEALED_STATE_INVALID_MESSAGE}
 * error (the SDK turns a throwing tool callback into an `isError` result with
 * the message text); the codec's opaque reason code stays on `cause`.
 */
export function createSealedState(
  codec: RequestStateCodec,
  ctx: ServerContext,
  operation: string,
): SealedState {
  return {
    seal: (payload) => codec.mint({ p: "v", d: payload }, ctx),
    open: async <T>(token: string): Promise<T> => {
      let decoded: unknown;
      try {
        decoded = await codec.verify(token, ctx);
      } catch (cause) {
        throw new Error(SEALED_STATE_INVALID_MESSAGE, { cause });
      }
      // A token minted for the MRTR carrier is not a view token, even though
      // its MAC checks out. Refuse it with the same opaque message.
      if (!isEnvelope(decoded, "v")) {
        throw new Error(SEALED_STATE_INVALID_MESSAGE);
      }
      return decoded.d as T;
    },
    sealRequestState: (payload) =>
      codec.mint({ p: "r", d: payload, o: operation }, ctx),
    requestState: <T>(): T | undefined => {
      // The `requestState.verify` seam already checked the MAC, the expiry,
      // and the purpose; an unverified round has no state at all.
      const envelope = ctx.mcpReq.requestState<SealedEnvelope>();
      if (envelope === undefined) {
        return undefined;
      }
      if (!isEnvelope(envelope, "r") || envelope.o !== operation) {
        throw new Error(SEALED_STATE_INVALID_MESSAGE);
      }
      return envelope.d as T;
    },
  };
}
