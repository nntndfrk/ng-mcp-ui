import {
  type Signal,
  assertInInjectionContext,
  computed,
  inject,
} from "@angular/core";
import { createHostContextSignals } from "./host-context.js";
// Token imported from the leaf tokens module (THE RULE): every inject* wrapper
// resolves the host via MCP_ADAPTOR, never getAdaptor(). Importing the leaf
// keeps the wrapper off the provide-mcp-ui import chain.
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Shorthand for an arbitrary plain object — `Record<string, unknown>`.
 * Defined locally so the web layer needs no shared types module.
 */
type UnknownObject = Record<string, unknown>;

// Absent host-context fields surface as `null`, not `undefined`: the adaptor
// stores type `toolInput` / `toolOutput` / `toolResponseMetadata` as
// `Record<string, unknown> | null` (see bridges/types.ts HostContext) and the
// wrapper passes those snapshots through verbatim. Modeling absence as `null`
// keeps the public types aligned with the runtime values.

/** {@link injectToolInfo} state before the tool has been invoked. */
export type ToolIdleState = {
  status: "idle";
  isIdle: true;
  isPending: false;
  isSuccess: false;
  input: null;
  output: null;
  responseMetadata: null;
};

/** {@link injectToolInfo} state while the tool is executing — `input` is available, output is not yet. */
export type ToolPendingState<ToolInput extends UnknownObject> = {
  status: "pending";
  isIdle: false;
  isPending: true;
  isSuccess: false;
  input: ToolInput;
  output: null;
  responseMetadata: null;
};

/**
 * {@link injectToolInfo} state once the tool returned — `input` is present and
 * at least one of `output` / `responseMetadata` is present. The other may still
 * be `null`: `deriveStatus` reaches `success` as soon as *either* arrives (an
 * mcp-app host can push `responseMetadata` without `structuredContent`), so both
 * are modeled as nullable to match the runtime.
 */
export type ToolSuccessState<
  ToolInput extends UnknownObject,
  ToolOutput extends UnknownObject,
  ToolResponseMetadata extends UnknownObject,
> = {
  status: "success";
  isIdle: false;
  isPending: false;
  isSuccess: true;
  input: ToolInput;
  output: ToolOutput | null;
  responseMetadata: ToolResponseMetadata | null;
};

/**
 * Discriminated union describing the tool invocation that triggered the
 * current view render. Use `isIdle` / `isPending` / `isSuccess` to narrow.
 *
 * The field set and discriminants are chosen so the typed helper generated in
 * the typed-helpers slice (`injectAppHelpers`) infers each field precisely.
 */
export type ToolState<
  ToolInput extends UnknownObject,
  ToolOutput extends UnknownObject,
  ToolResponseMetadata extends UnknownObject,
> =
  | ToolIdleState
  | ToolPendingState<ToolInput>
  | ToolSuccessState<ToolInput, ToolOutput, ToolResponseMetadata>;

/**
 * Partial shape used to refine each typed field of {@link injectToolInfo}.
 */
type ToolSignature = {
  input: UnknownObject;
  output: UnknownObject;
  responseMetadata: UnknownObject;
};

/**
 * Derive the lifecycle status from the three host-context fields: no `toolInput`
 * → idle; input present but neither output nor metadata → pending; otherwise
 * success.
 */
function deriveStatus(
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
  responseMetadata: Record<string, unknown> | null,
): "idle" | "pending" | "success" {
  if (input === null) {
    return "idle";
  }
  if (output === null && responseMetadata === null) {
    return "pending";
  }
  return "success";
}

/**
 * Signal-based tool-info wrapper.
 *
 * Returns a single readonly {@link Signal} of {@link ToolState} that recomputes
 * from the `toolInput` / `toolOutput` / `toolResponseMetadata` host-context keys
 * whenever the host pushes a new value.
 *
 * Must be called from an injection context (constructor, factory, or
 * `runInInjectionContext`). The adaptor is resolved from {@link MCP_ADAPTOR}
 * (provided by `provideMcpUi()`) — nothing here calls `getAdaptor()` (THE RULE,
 * PLAN §5.3). Host-context subscriptions are torn down with the ambient
 * `DestroyRef` (wired by {@link createHostContextSignals}).
 *
 * @typeParam TS - Optional partial `{ input, output, responseMetadata }` shape
 * refining each typed field. When omitted it defaults to {@link ToolSignature},
 * so each typed field resolves to the generic `Record<string, unknown>` (absent
 * fields are still `null` per the state types). A `Record<string, never>` default
 * was wrong here — indexing it collapses every field to `never`.
 *
 * @example
 * ```ts
 * const tool = injectToolInfo<{
 *   input: { query: string };
 *   output: { results: Result[] };
 * }>();
 * // in a template / effect:
 * const state = tool();
 * if (state.isSuccess) {
 *   console.log(state.output.results);
 * }
 * ```
 */
export function injectToolInfo<
  TS extends Partial<ToolSignature> = ToolSignature,
>(): Signal<
  ToolState<
    UnknownObject & TS["input"],
    UnknownObject & TS["output"],
    UnknownObject & TS["responseMetadata"]
  >
> {
  assertInInjectionContext(injectToolInfo);
  const adaptor = inject(MCP_ADAPTOR);
  const ctx = createHostContextSignals(adaptor);

  type Input = UnknownObject & TS["input"];
  type Output = UnknownObject & TS["output"];
  type Metadata = UnknownObject & TS["responseMetadata"];

  return computed(() => {
    const input = ctx.toolInput();
    const output = ctx.toolOutput();
    const responseMetadata = ctx.toolResponseMetadata();
    const status = deriveStatus(input, output, responseMetadata);

    // The runtime object is built with the live values; the discriminated
    // ToolState type carries the per-status narrowing. The fields line up by
    // construction: deriveStatus guarantees input!==null for pending/success, etc.
    return {
      input,
      status,
      isIdle: status === "idle",
      isPending: status === "pending",
      isSuccess: status === "success",
      output,
      responseMetadata,
    } as ToolState<Input, Output, Metadata>;
  });
}
