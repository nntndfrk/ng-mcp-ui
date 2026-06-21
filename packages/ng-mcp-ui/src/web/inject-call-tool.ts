import {
  type Signal,
  assertInInjectionContext,
  inject,
  signal,
} from "@angular/core";
import type { CallToolArgs, CallToolResponse } from "./bridges/types.js";
// Token imported from the leaf tokens module (THE RULE): every inject* wrapper
// resolves the host via MCP_ADAPTOR, never getAdaptor(). Importing the leaf
// keeps the wrapper off the provide-mcp-ui import chain.
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * `true` if `T` has at least one required key, `false` if every key is optional.
 * Defined locally so the web layer needs no shared types module.
 */
type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];
type HasRequiredKeys<T> = RequiredKeys<T> extends never ? false : true;

type CallToolIdleState = {
  status: "idle";
  isIdle: true;
  isPending: false;
  isSuccess: false;
  isError: false;
  data: undefined;
  error: undefined;
};

type CallToolPendingState = {
  status: "pending";
  isIdle: false;
  isPending: true;
  isSuccess: false;
  isError: false;
  data: undefined;
  error: undefined;
};

type CallToolSuccessState<TData extends CallToolResponse = CallToolResponse> = {
  status: "success";
  isIdle: false;
  isPending: false;
  isSuccess: true;
  isError: false;
  data: TData;
  error: undefined;
};

type CallToolErrorState = {
  status: "error";
  isIdle: false;
  isPending: false;
  isSuccess: false;
  isError: true;
  data: undefined;
  error: unknown;
};

/**
 * State of an {@link injectCallTool} invocation, discriminated by `status`.
 * Use `isIdle` / `isPending` / `isSuccess` / `isError` for ergonomic narrowing.
 */
export type CallToolState<TData extends CallToolResponse = CallToolResponse> =
  | CallToolIdleState
  | CallToolPendingState
  | CallToolSuccessState<TData>
  | CallToolErrorState;

/**
 * Optional callbacks fired around an {@link injectCallTool} call.
 * `onSettled` runs after success or error.
 */
export type SideEffects<ToolArgs, ToolResponse> = {
  onSuccess?: (data: ToolResponse, toolArgs: ToolArgs) => void;
  onError?: (error: unknown, toolArgs: ToolArgs) => void;
  onSettled?: (
    data: ToolResponse | undefined,
    error: unknown | undefined,
    toolArgs: ToolArgs,
  ) => void;
};

type IsArgsOptional<T> = [T] extends [null]
  ? true
  : HasRequiredKeys<T> extends false
    ? true
    : false;

/**
 * Fire-and-forget call function returned by {@link injectCallTool}. Tracks state
 * on the returned signals and supports optional {@link SideEffects} callbacks.
 * Args are optional when the tool accepts none.
 */
export type CallToolFn<TArgs, TResponse> =
  IsArgsOptional<TArgs> extends true
    ? {
        (): void;
        (sideEffects: SideEffects<TArgs, TResponse>): void;
        (args: TArgs): void;
        (args: TArgs, sideEffects: SideEffects<TArgs, TResponse>): void;
      }
    : {
        (args: TArgs): void;
        (args: TArgs, sideEffects: SideEffects<TArgs, TResponse>): void;
      };

/**
 * Promise-returning call function returned by {@link injectCallTool}. Rejects if
 * the tool errors; use `try/catch`.
 */
export type CallToolAsyncFn<TArgs, TResponse> =
  IsArgsOptional<TArgs> extends true
    ? {
        (): Promise<TResponse>;
        (args: TArgs): Promise<TResponse>;
      }
    : (args: TArgs) => Promise<TResponse>;

type ToolResponseSignature = Pick<
  CallToolResponse,
  "structuredContent" | "meta"
>;

/**
 * Result object returned by {@link injectCallTool}: the discriminated-union
 * status as individual readonly {@link Signal}s plus the two callers. Exposes
 * `status` / `data` / `error` as signals (the boolean `isIdle` / `isPending` /
 * … flags are derivable from `status()` and omitted to keep the surface
 * signal-shaped).
 */
export type InjectCallToolResult<TArgs, TResponse extends CallToolResponse> = {
  callTool: CallToolFn<TArgs, TResponse>;
  callToolAsync: CallToolAsyncFn<TArgs, TResponse>;
  status: Signal<CallToolState<TResponse>["status"]>;
  data: Signal<TResponse | undefined>;
  error: Signal<unknown>;
};

/**
 * Signal-based call-tool wrapper.
 *
 * Call a server tool from a view and track its execution state. Returns
 * `{ callTool, callToolAsync, status, data, error }`: `callTool` is
 * fire-and-forget (with optional {@link SideEffects}), `callToolAsync` returns
 * the promise. `status` / `data` / `error` are readonly signals updated as the
 * call moves idle → pending → success | error.
 *
 * If the same instance is invoked again while a call is in
 * flight, the older response is dropped from the tracked signals (a monotonic
 * `callId` guards the writes) — but any `onSuccess` / `onError` / `onSettled`
 * callbacks attached to the superseded call still fire.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * @typeParam ToolArgs - Shape of the tool's input args (`null` for no-arg tools).
 * @typeParam ToolResponse - Refines the tool's `structuredContent` / `meta`.
 */
export function injectCallTool<
  ToolArgs extends CallToolArgs = null,
  ToolResponse extends Partial<ToolResponseSignature> = Record<string, never>,
>(
  name: string,
): InjectCallToolResult<ToolArgs, CallToolResponse & ToolResponse> {
  assertInInjectionContext(injectCallTool);
  const adaptor = inject(MCP_ADAPTOR);

  type CombinedCallToolResponse = CallToolResponse & ToolResponse;

  // The boolean flags in CallToolState are derived from `status`; here we expose
  // `status` directly as a signal and keep `data` / `error` aligned.
  const status =
    signal<CallToolState<CombinedCallToolResponse>["status"]>("idle");
  const data = signal<CombinedCallToolResponse | undefined>(undefined);
  const error = signal<unknown>(undefined);

  // Monotonic guard: only the most recent call is allowed to write back into
  // the signals.
  let callId = 0;

  const execute = async (
    toolArgs: ToolArgs,
  ): Promise<CombinedCallToolResponse> => {
    const id = ++callId;
    status.set("pending");
    data.set(undefined);
    error.set(undefined);

    try {
      const result = await adaptor.callTool<ToolArgs, CombinedCallToolResponse>(
        name,
        toolArgs,
      );
      if (id === callId) {
        status.set("success");
        data.set(result);
        error.set(undefined);
      }
      return result;
    } catch (err) {
      if (id === callId) {
        status.set("error");
        data.set(undefined);
        error.set(err);
      }
      throw err;
    }
  };

  const callToolAsync = ((toolArgs?: ToolArgs) => {
    if (toolArgs === undefined) {
      return execute(null as ToolArgs);
    }
    return execute(toolArgs);
  }) as CallToolAsyncFn<ToolArgs, CombinedCallToolResponse>;

  const callTool = ((
    firstArg?: ToolArgs | SideEffects<ToolArgs, CombinedCallToolResponse>,
    sideEffects?: SideEffects<ToolArgs, CombinedCallToolResponse>,
  ) => {
    let toolArgs: ToolArgs;
    // Disambiguate `callTool(sideEffects)` from `callTool(args)`: treat the
    // leading object as SideEffects only when EVERY own key is a known callback
    // (and there is at least one). A looser `"onSuccess" in firstArg` check
    // misread a real args object that merely *contained* an `onSuccess` /
    // `onError` / `onSettled` key — all valid `CallToolArgs` keys — as callbacks,
    // silently dropping the args and calling the tool with `null`.
    const firstArgKeys =
      firstArg && typeof firstArg === "object" ? Object.keys(firstArg) : [];
    if (
      firstArgKeys.length > 0 &&
      firstArgKeys.every(
        (k) => k === "onSuccess" || k === "onError" || k === "onSettled",
      )
    ) {
      toolArgs = null as ToolArgs; // no toolArgs provided
      sideEffects = firstArg as SideEffects<
        ToolArgs,
        CombinedCallToolResponse
      >;
    } else {
      toolArgs = (firstArg === undefined ? null : firstArg) as ToolArgs;
    }

    execute(toolArgs)
      .then((result) => {
        sideEffects?.onSuccess?.(result, toolArgs);
        sideEffects?.onSettled?.(result, undefined, toolArgs);
      })
      .catch((err) => {
        sideEffects?.onError?.(err, toolArgs);
        sideEffects?.onSettled?.(undefined, err, toolArgs);
      });
  }) as CallToolFn<ToolArgs, CombinedCallToolResponse>;

  return {
    callTool,
    callToolAsync,
    status: status.asReadonly(),
    data: data.asReadonly(),
    error: error.asReadonly(),
  };
}
