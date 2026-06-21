import {
  DestroyRef,
  type Signal,
  assertInInjectionContext,
  inject,
  signal,
} from "@angular/core";
import type { Adaptor, HostContext } from "./bridges/types.js";
// Token imported from the leaf tokens module to keep host-context off the
// provide-mcp-ui import chain (which will pull in mcp-modal → host-context).
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Signal-based host-context wrapper.
 *
 * Exposes a readonly Angular {@link Signal} per {@link HostContext} key. Each
 * signal is
 * seeded with the store's current snapshot and updated whenever the adaptor's
 * per-key store fires `onStoreChange`.
 *
 * Dedup note: we add no equality check of our own. `subscribe` may fire on any
 * host emit for the key (not only on value changes), but redundant writes are
 * absorbed downstream — the Angular signal compares with `Object.is` (an equal
 * primitive is a no-op), and the mcp-app store's `getSnapshot` returns a
 * `deepEqual`-cached reference (an unchanged object stays `Object.is`-equal). So
 * every push can write straight into the signal.
 */
export type HostContextSignals = {
  readonly [K in keyof HostContext]: Signal<HostContext[K]>;
} & {
  /**
   * Tear down every host-context subscription. Called automatically via
   * {@link DestroyRef} when {@link createHostContextSignals} runs inside an
   * injection context; call it manually otherwise.
   */
  destroy(): void;
};

/** Keys of {@link HostContext}, enumerated so each gets its own signal/subscription. */
const HOST_CONTEXT_KEYS = [
  "theme",
  "locale",
  "displayMode",
  "safeArea",
  "maxHeight",
  "userAgent",
  "toolInput",
  "toolOutput",
  "toolResponseMetadata",
  "display",
  "viewState",
] as const satisfies readonly (keyof HostContext)[];

// Compile-time exhaustiveness guard: `satisfies` above only checks membership,
// not coverage. If a key is ever added to HostContext without being listed in
// HOST_CONTEXT_KEYS, the mapped HostContextSignals type would promise a signal
// the runtime never creates — this line turns that drift into a build error.
type _AssertAllKeysListed = Exclude<
  keyof HostContext,
  (typeof HOST_CONTEXT_KEYS)[number]
> extends never
  ? true
  : ["HOST_CONTEXT_KEYS is missing HostContext keys", never];
const _allKeysListed: _AssertAllKeysListed = true;
void _allKeysListed;

/**
 * Build a {@link HostContextSignals} object from an {@link Adaptor}: one
 * readonly signal per {@link HostContext} key, each backed by the adaptor's
 * `getHostContextStore(key)` (`subscribe` / `getSnapshot`).
 *
 * Lifecycle:
 * - When invoked inside an Angular injection context, subscriptions are
 *   unsubscribed automatically via `DestroyRef.onDestroy`.
 * - The returned object also exposes a manual `destroy()` for use outside DI
 *   (e.g. plain unit tests or imperative bootstrapping).
 *
 * The `adaptor` is passed explicitly here for non-DI use (plain unit tests or
 * imperative bootstrapping). Inside an Angular injection context, prefer
 * {@link injectHostContext}, which resolves the adaptor from the
 * {@link MCP_ADAPTOR} token automatically.
 */
export function createHostContextSignals(adaptor: Adaptor): HostContextSignals {
  const unsubscribers: Array<() => void> = [];

  const result = {} as Record<string, unknown>;

  for (const key of HOST_CONTEXT_KEYS) {
    const store = adaptor.getHostContextStore(key);
    // Seed with the current snapshot (mirrors useSyncExternalStore's initial read).
    const sig = signal(store.getSnapshot());

    // Subscribe; on every host push, write the fresh snapshot into the signal.
    // `subscribe` can fire even when the value is unchanged; the signal's
    // `Object.is` check (and the mcp-app store's deepEqual snapshot cache) absorb
    // the redundant write, so setting unconditionally is safe.
    const unsubscribe = store.subscribe(() => {
      sig.set(store.getSnapshot());
    });
    unsubscribers.push(unsubscribe);

    // Expose only the readonly side of the signal.
    result[key] = sig.asReadonly();
  }

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
  result.destroy = destroy;

  // Auto-cleanup when created in an injection context. `inject()` throws
  // (NG0203) outside DI, so we probe optionally and ignore that case — callers
  // not in DI are expected to call `destroy()` themselves.
  const destroyRef = tryInjectDestroyRef();
  if (destroyRef) {
    destroyRef.onDestroy(destroy);
  }

  return result as HostContextSignals;
}

/**
 * Resolve the ambient {@link DestroyRef} if we are inside an injection context,
 * otherwise return `null`. `inject()` throws (NG0203) outside DI; we treat that
 * as "no DI" so {@link createHostContextSignals} works in plain (non-DI) code.
 */
function tryInjectDestroyRef(): DestroyRef | null {
  try {
    return inject(DestroyRef, { optional: true });
  } catch {
    return null;
  }
}

/**
 * Injection-context entry point. Must be called from an injection context
 * (constructor, factory, or `runInInjectionContext`). The adaptor is resolved
 * from the {@link MCP_ADAPTOR} token (provided by `provideMcpUi()`), so nothing
 * here calls `getAdaptor()` — proving THE RULE: everything downstream injects
 * the token. Cleanup is wired to the ambient `DestroyRef` automatically.
 */
export function injectHostContext(): HostContextSignals {
  assertInInjectionContext(injectHostContext);
  const adaptor = inject(MCP_ADAPTOR);
  return createHostContextSignals(adaptor);
}
