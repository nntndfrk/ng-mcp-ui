import {
  DestroyRef,
  type Signal,
  assertInInjectionContext,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Adaptor, ViewState } from "./bridges/types.js";
import {
  filterViewContext,
  injectViewContext,
} from "./helpers/state.js";
import { deepEqual } from "./bridges/mcp-app/deep-equal.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Default debounce window (ms) for coalescing local store writes into a single
 * `adaptor.setViewState` call. `0` schedules a trailing write on the next macro
 * task, so any number of synchronous `set`/`update`/`patch` calls in the same
 * tick collapse into one host write — the signal-equivalent of the reference
 * store's "debounced writes". Tune via {@link InjectViewStoreOptions.debounceMs}.
 */
const DEFAULT_DEBOUNCE_MS = 0;

/**
 * Updater accepted by {@link InjectViewStore.set} / {@link InjectViewStore.update}:
 * either the next value or a function of the previous (possibly `null`) state.
 */
export type ViewStoreUpdater<State extends ViewState> =
  | State
  | null
  | ((prevState: State | null) => State | null);

/**
 * State creator: a value, `null`, or a lazy initializer of the seed state. The
 * signal analogue of the reference store's `(set) => ({ ... })` creator —
 * trimmed to the seed shape, since selectors/actions are expressed as Angular
 * signals on the returned handle rather than baked into the state object.
 */
export type ViewStoreCreator<State extends ViewState> =
  | State
  | null
  | (() => State | null);

/** Options for {@link injectViewStore}. */
export type InjectViewStoreOptions = {
  /**
   * Debounce window in ms for coalescing local writes into one host
   * `setViewState`. Defaults to {@link DEFAULT_DEBOUNCE_MS} (`0` — next macro
   * task). A trailing-edge debounce: the last value written within the window
   * is the one persisted.
   */
  debounceMs?: number;
};

/**
 * Handle returned by {@link injectViewStore}: a richer, store-style API over the
 * same host `viewState` bidirectional-sync machinery that {@link injectViewState}
 * uses.
 *
 * @typeParam State - Shape of the store's state (a plain object).
 */
export type InjectViewStore<State extends ViewState> = {
  /** Readonly signal of the current (context-filtered) state. */
  state: Signal<State | null>;
  /**
   * Replace the state. Accepts a value, `null`, or a `(prev) => next` updater
   * (the previous value is the current filtered state). A non-null result is
   * persisted to the host (debounced). `set(null)` clears the local `state`
   * signal but does **not** persist a host clear — `adaptor.setViewState` has no
   * `null` form — matching {@link injectViewState}.
   */
  set: (updater: ViewStoreUpdater<State>) => void;
  /**
   * Merge a partial into the current state, or apply a `(prev) => partial`
   * producer, shallow-merging the result onto the previous state. A no-op-safe
   * convenience over {@link InjectViewStore.set} for object updates. Persists
   * (debounced).
   */
  update: (
    partial:
      | Partial<State>
      | ((prevState: State | null) => Partial<State>),
  ) => void;
  /**
   * Alias of {@link InjectViewStore.update} mirroring the common store "patch"
   * verb. Shallow-merges a partial onto the previous state.
   */
  patch: (
    partial:
      | Partial<State>
      | ((prevState: State | null) => Partial<State>),
  ) => void;
  /**
   * Derive a memoized read-only signal from the state via a selector — the
   * signal analogue of the reference store's selector overload. Recomputes when
   * `state` changes.
   */
  select: <T>(selector: (state: State | null) => T) => Signal<T>;
  /**
   * Force any pending debounced write to flush synchronously (cancelling the
   * timer). Useful before navigation/teardown and for deterministic tests. A
   * no-op when nothing is pending. The store also flushes automatically on
   * destroy.
   */
  flush: () => void;
};

/**
 * Signal-based **view store** — a store-style API over the host `viewState`
 * bidirectional sync that {@link injectViewState} already provides. Reach for
 * this when you have outgrown `injectViewState` and want first-class store
 * ergonomics: read the current state as a signal, `set`/`update`/`patch` from a
 * function of the previous state, and derive memoized `select`ors — all while
 * the state stays synced with the host so it survives view remounts.
 *
 * Prefer {@link injectViewState} for a single value with a `value`/`set` pair;
 * reach for `injectViewStore` when you want selectors, partial updates, and an
 * explicit flush. Both share the exact same merge/persist/rehydrate machinery.
 *
 * Sync semantics (identical to {@link injectViewState}, plus a conflict guard):
 * - **Seed:** the host's current `viewState` (filtered, see
 *   {@link filterViewContext}) if present, else the supplied initial state
 *   (value or lazy creator), else `null`.
 * - **Local writes → host:** `set`/`update`/`patch` compute the next state,
 *   re-attach the host's `data-llm` view-context via {@link injectViewContext}
 *   (so a user write never clobbers the host's channel payload), and persist the
 *   merged state with `adaptor.setViewState` — **debounced** (see below). The
 *   exposed `state` signal updates immediately (optimistic, filtered).
 * - **Host pushes → store (rehydrate):** the wrapper subscribes to the
 *   `viewState` host-context store. On each push it filters the snapshot, then
 *   applies the **conflict rule** — only `state.set` when the filtered external
 *   snapshot is {@link deepEqual}-different from the current state. This is the
 *   new bit over `injectViewState`: it prevents a write/echo loop, since our own
 *   `setViewState` re-notifies the store with the value we just wrote. A host
 *   push of `null` is ignored (the `!== null` guard) so a transient clear does
 *   not wipe local state.
 *
 * **Debounce window:** local writes are coalesced with a trailing-edge timer
 * (default `0` ms — the next macro task; configurable via `options.debounceMs`).
 * Any burst of synchronous writes in one tick results in a single
 * `setViewState` carrying the final value, matching the reference store's
 * "debounced writes". Call {@link InjectViewStore.flush} to persist immediately;
 * the pending timer is cleared (and a final flush performed) on destroy via the
 * ambient {@link DestroyRef}.
 *
 * **View-context filtering:** the host stashes its internal `data-llm` channel
 * under a reserved key; that field is filtered out of the exposed `state`
 * ({@link filterViewContext}) and re-attached only on persist
 * ({@link injectViewContext}), so user code never sees or has to preserve it.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * @typeParam State - Shape of the persisted state (a plain object).
 * @param initialState Seed state (value, `null`, or lazy creator). Used only
 *   when the host has no existing `viewState`.
 * @param defaultState Fallback seed used when `initialState` resolves to `null`
 *   and the host has no `viewState` — lets callers pass a creator plus a plain
 *   default, mirroring the reference store's `(creator, defaultState)` shape.
 * @param options See {@link InjectViewStoreOptions} (debounce window).
 */
export function injectViewStore<State extends ViewState>(
  initialState?: ViewStoreCreator<State>,
  defaultState?: State | (() => State | null) | null,
  options: InjectViewStoreOptions = {},
): InjectViewStore<State> {
  assertInInjectionContext(injectViewStore);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const store = adaptor.getHostContextStore("viewState");
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // Seed: host viewState (filtered) if present, else the initial state, else
  // the default (value or lazy initializer), else null — the same precedence as
  // injectViewState, with an extra `initialState` step ahead of `defaultState`.
  const seedFromBridge = store.getSnapshot() as State | null;
  const initial: State | null =
    seedFromBridge !== null
      ? filterViewContext(seedFromBridge)
      : resolveSeed(initialState) ?? resolveSeed(defaultState);

  const state = signal<State | null>(initial);

  // ── debounced persist ──────────────────────────────────────────────────────
  // Trailing-edge timer: rapid local writes coalesce into a single host write of
  // the latest value. The pending value is tracked separately so a flush always
  // persists the freshest state, not a stale closure capture.
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingState: State | null = null;
  let hasPending = false;

  const persistNow = (): void => {
    if (!hasPending) {
      return;
    }
    const next = pendingState;
    hasPending = false;
    pendingState = null;
    // Re-attach the host's view-context, then fire-and-forget the host write.
    const stateToSet = injectViewContext(adaptor, next);
    if (stateToSet !== null) {
      void adaptor.setViewState(stateToSet);
    }
  };

  const flush = (): void => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    persistNow();
  };

  const schedulePersist = (next: State | null): void => {
    pendingState = next;
    hasPending = true;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      persistNow();
    }, debounceMs);
  };

  // ── writers ─────────────────────────────────────────────────────────────────
  const set = (updater: ViewStoreUpdater<State>): void => {
    const prevState = state();
    const next =
      typeof updater === "function"
        ? (updater as (prev: State | null) => State | null)(prevState)
        : updater;
    // Filter once, then use that same value for both the optimistic local update
    // and the (debounced) persist. Filtering before persist keeps a
    // caller-supplied reserved `VIEW_CONTEXT_KEY` from leaking to the host;
    // `persistNow` re-attaches the host's own view-context via `injectViewContext`.
    const filtered = filterViewContext(next);
    state.set(filtered);
    schedulePersist(filtered);
  };

  const update = (
    partial:
      | Partial<State>
      | ((prevState: State | null) => Partial<State>),
  ): void => {
    set((prev) => {
      const delta =
        typeof partial === "function"
          ? (partial as (p: State | null) => Partial<State>)(prev)
          : partial;
      return { ...(prev ?? ({} as State)), ...delta } as State;
    });
  };

  const select = <T>(selector: (s: State | null) => T): Signal<T> =>
    computed(() => selector(state()));

  // ── host → store rehydrate (with deepEqual conflict guard) ──────────────────
  const unsubscribe = store.subscribe(() => {
    const fromBridge = store.getSnapshot() as State | null;
    if (fromBridge === null) {
      return;
    }
    const filtered = filterViewContext(fromBridge);
    // Conflict rule: only adopt an external snapshot that actually differs from
    // the current state. Our own setViewState re-notifies the store with the
    // value we just wrote; deepEqual collapses that echo so we never loop.
    if (!deepEqual(filtered, state())) {
      state.set(filtered);
    }
  });

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    flush();
  });

  return {
    state: state.asReadonly(),
    set,
    update,
    patch: update,
    select,
    flush,
  };
}

/** Resolve a seed creator (value | null | lazy) to a value (or null). */
function resolveSeed<State extends ViewState>(
  seed: ViewStoreCreator<State> | (() => State | null) | undefined | null,
): State | null {
  if (typeof seed === "function") {
    return (seed as () => State | null)();
  }
  return seed ?? null;
}
