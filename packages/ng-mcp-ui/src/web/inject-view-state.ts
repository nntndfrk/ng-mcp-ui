import {
  DestroyRef,
  type Signal,
  assertInInjectionContext,
  inject,
  signal,
} from "@angular/core";
import type { Adaptor, ViewState } from "./bridges/types.js";
import { filterViewContext, injectViewContext } from "./helpers/state.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Updater accepted by {@link InjectViewStateResult.set}. Either the next value
 * or a function of the previous value (which may be `null`), modeled on React's
 * `SetStateAction<T | null>`.
 */
export type SetViewStateUpdater<T extends ViewState> =
  | T
  | null
  | ((prevState: T | null) => T | null);

/**
 * Result of {@link injectViewState}: a readonly {@link Signal} of the persisted
 * state plus a `set` writer.
 *
 * Returns `{ value, set }` to match the project's other inject* wrappers
 * (`injectCallTool` returns an object). `value` is the context-filtered state;
 * `set` persists via `adaptor.setViewState` and updates `value`.
 */
export type InjectViewStateResult<T extends ViewState> = {
  value: Signal<T | null>;
  set: (updater: SetViewStateUpdater<T>) => void;
};

/**
 * Signal-based view-state wrapper.
 *
 * Persist a piece of UI state on the host so it survives view remounts and is
 * restored on subsequent renders of the same tool invocation. Returns
 * `{ value, set }`:
 * - `value` is a readonly signal of the persisted state with the host's internal
 *   context fields stripped ({@link filterViewContext}).
 * - `set(updater)` accepts a value or `(prev) => next` updater (React's
 *   `SetStateAction` form), merges the host's `data-llm` view-context back in
 *   ({@link injectViewContext}), persists the merged state via
 *   `adaptor.setViewState`, and writes the filtered result into `value`.
 *
 * Merge/persist semantics:
 * - Initial value: the host's current `viewState` (filtered) if present,
 *   otherwise the provided default (value or lazy initializer), otherwise null.
 * - When the host pushes a new non-null `viewState`, `value` updates to its
 *   filtered form: the wrapper subscribes directly to the `viewState`
 *   host-context store and writes the filtered snapshot into the signal on each
 *   push. A host push of `null` is ignored (the `!== null` guard) so a transient
 *   clear does not wipe local state. The subscription is torn down via the
 *   ambient {@link DestroyRef}.
 * - `set` only calls `adaptor.setViewState` when the context-injected state is
 *   non-null, and does not await it (fire-and-forget).
 *
 * Implementation note: this wrapper subscribes to the adaptor's `viewState`
 * store directly rather than reusing {@link createHostContextSignals} — it needs
 * both the raw push callback (to imperatively `set` the local signal) and a
 * writable local signal, which the readonly host-context signals do not provide.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * @typeParam T - Shape of the persisted state (a plain object).
 */
export function injectViewState<T extends ViewState>(
  defaultState?: T | (() => T | null) | null,
): InjectViewStateResult<T> {
  assertInInjectionContext(injectViewState);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const store = adaptor.getHostContextStore("viewState");

  // Seed: host viewState (filtered) if present, else the default (value or lazy
  // initializer), else null.
  const seedFromBridge = store.getSnapshot() as T | null;
  const initial: T | null =
    seedFromBridge !== null
      ? filterViewContext(seedFromBridge)
      : typeof defaultState === "function"
        ? (defaultState as () => T | null)()
        : (defaultState ?? null);

  const value = signal<T | null>(initial);

  // Adopt the host's new viewState (filtered) on each push. The null guard means
  // a host clear (null) does not overwrite local state.
  const unsubscribe = store.subscribe(() => {
    const fromBridge = store.getSnapshot() as T | null;
    if (fromBridge !== null) {
      value.set(filterViewContext(fromBridge));
    }
  });
  inject(DestroyRef).onDestroy(unsubscribe);

  const set = (updater: SetViewStateUpdater<T>): void => {
    // Compute next state from the updater (function form sees prev value).
    const prevState = value();
    const newState =
      typeof updater === "function"
        ? (updater as (prev: T | null) => T | null)(prevState)
        : updater;
    const stateToSet = injectViewContext(adaptor, newState);

    if (stateToSet !== null) {
      // Fire-and-forget: do not await setViewState.
      void adaptor.setViewState(stateToSet);
    }

    value.set(filterViewContext(stateToSet));
  };

  return { value: value.asReadonly(), set };
}
