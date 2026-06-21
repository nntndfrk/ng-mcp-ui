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

  // Only clone when the host-internal key is actually present. Returning the
  // original reference for an unchanged snapshot keeps it referentially equal,
  // so a Signal `set` with it is a no-op rather than a spurious recompute.
  // `Object.hasOwn` checks own keys only (not the prototype chain — the snapshot
  // is external host data).
  if (!Object.hasOwn(state, VIEW_CONTEXT_KEY)) {
    return state;
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

  // `Object.hasOwn` (own key only — the snapshot is external host data, so the
  // prototype-walking `in` operator could pick up an inherited key). The store
  // types `viewState` as `Record | null`, so no separate `undefined` guard.
  if (currentState !== null && Object.hasOwn(currentState, VIEW_CONTEXT_KEY)) {
    return {
      ...newState,
      [VIEW_CONTEXT_KEY]: currentState[VIEW_CONTEXT_KEY],
    } as T;
  }

  return newState;
}
