import type { Adaptor, ViewState } from "../bridges/types.js";

/**
 * Key under which the host's internal "view context" (the `data-llm` channel
 * payload) is stashed inside the persisted view state.
 *
 * The full `data-llm` feature (a directive + content channel) lands in S14; the
 * view-state wrapper only needs this constant — the string under which that
 * channel's data is merged into / filtered out of the persisted view state — so
 * it is declared locally here to avoid a forward dependency on S14. This value
 * must match the host's so persisted state round-trips.
 */
export const VIEW_CONTEXT_KEY = "__view_context" as const;

/**
 * Strip the host-internal {@link VIEW_CONTEXT_KEY} field out of a view
 * state snapshot before handing it to user code. `null`/`undefined` collapse to
 * `null`.
 */
export function filterViewContext<T extends ViewState>(
  state?: T | null,
): T | null {
  if (state === null || state === undefined) {
    return null;
  }

  const { [VIEW_CONTEXT_KEY]: _, ...filteredState } = state as T & {
    [VIEW_CONTEXT_KEY]?: unknown;
  };

  return filteredState as T;
}

/**
 * Re-attach the host's current {@link VIEW_CONTEXT_KEY} (if any) onto a new view
 * state about to be persisted, so a user-driven state write never clobbers the
 * `data-llm` channel payload the host injected.
 *
 * Takes the resolved {@link Adaptor} explicitly (THE RULE, PLAN §5.3 — callers
 * inject `MCP_ADAPTOR` and pass it down; nothing here calls `getAdaptor()`).
 */
export function injectViewContext<T extends ViewState>(
  adaptor: Adaptor,
  newState: T | null,
): T | null {
  if (newState === null) {
    return null;
  }

  const currentState = adaptor
    .getHostContextStore("viewState")
    .getSnapshot() as (T & { [VIEW_CONTEXT_KEY]?: unknown }) | null;

  if (
    currentState !== null &&
    currentState !== undefined &&
    VIEW_CONTEXT_KEY in currentState
  ) {
    return {
      ...newState,
      [VIEW_CONTEXT_KEY]: currentState[VIEW_CONTEXT_KEY],
    } as T;
  }

  return newState;
}
