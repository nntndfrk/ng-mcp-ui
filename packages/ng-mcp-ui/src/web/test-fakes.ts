import type {
  Adaptor,
  HostContext,
  HostContextStore,
} from "./bridges/types.js";

/**
 * Shared test fakes for the inject* wrapper suites. This is **not** a public
 * API and not a test suite: it has no `.test.` infix so vitest's include glob
 * never collects it. It deliberately avoids importing `vitest` (a hand-rolled
 * call counter stands in for `vi.fn`) so `ngc` can compile it without test
 * types, mirroring the inline fakes in `host-context.test.ts` while
 * de-duplicating them across the inject* wrapper suites.
 */

/** Minimal call-recording spy (no vitest dependency). */
export type Spy<Args extends unknown[] = unknown[], R = unknown> = ((
  ...args: Args
) => R) & {
  calls: Args[];
  callCount: () => number;
};

export function spy<Args extends unknown[] = unknown[], R = unknown>(
  impl?: (...args: Args) => R,
): Spy<Args, R> {
  const calls: Args[] = [];
  const fn = ((...args: Args): R => {
    calls.push(args);
    return impl ? impl(...args) : (undefined as R);
  }) as Spy<Args, R>;
  fn.calls = calls;
  fn.callCount = () => calls.length;
  return fn;
}

/** A controllable per-key host-context store: holds a snapshot, lets the test `push` a new value. */
export type FakeStore<K extends keyof HostContext> = {
  store: HostContextStore<K>;
  push: (next: HostContext[K]) => void;
  unsubscribe: Spy;
  listenerCount: () => number;
};

export function createFakeStore<K extends keyof HostContext>(
  initial: HostContext[K],
): FakeStore<K> {
  let current = initial;
  const listeners = new Set<() => void>();
  const unsubscribe = spy();

  const store: HostContextStore<K> = {
    getSnapshot: () => current,
    subscribe: (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
        unsubscribe();
      };
    },
  };

  return {
    store,
    push: (next) => {
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
    unsubscribe,
    listenerCount: () => listeners.size,
  };
}

const DEFAULTS: { [K in keyof HostContext]: HostContext[K] } = {
  theme: "light",
  locale: "en-US",
  displayMode: "inline",
  safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  maxHeight: undefined,
  userAgent: {
    device: { type: "desktop" },
    capabilities: { hover: true, touch: false },
  },
  toolInput: null,
  toolOutput: null,
  toolResponseMetadata: null,
  display: { mode: "inline" },
  viewState: null,
};

const notImplemented = () => {
  throw new Error("not implemented in fake adaptor");
};

/**
 * Build a fake {@link Adaptor}. `stores` controls specific host-context keys
 * (others fall back to default snapshots); `methods` supplies overrides (use
 * {@link spy} for assertions). Any callable not overridden throws if touched, so
 * a test notices accidental use.
 */
export function createFakeAdaptor(
  options: {
    stores?: Partial<{ [K in keyof HostContext]: HostContextStore<K> }>;
    methods?: Partial<Adaptor>;
  } = {},
): Adaptor {
  const { stores = {}, methods = {} } = options;

  const base: Adaptor = {
    getHostContextStore: (<K extends keyof HostContext>(key: K) => {
      const override = stores[key];
      if (override) {
        return override;
      }
      return createFakeStore<K>(DEFAULTS[key]).store;
    }) as Adaptor["getHostContextStore"],
    callTool: notImplemented as Adaptor["callTool"],
    requestDisplayMode: notImplemented as Adaptor["requestDisplayMode"],
    requestClose: notImplemented as Adaptor["requestClose"],
    requestSize: notImplemented as Adaptor["requestSize"],
    sendFollowUpMessage: notImplemented as Adaptor["sendFollowUpMessage"],
    openExternal: notImplemented as Adaptor["openExternal"],
    download: notImplemented as Adaptor["download"],
    setViewState: notImplemented as Adaptor["setViewState"],
    uploadFile: notImplemented as Adaptor["uploadFile"],
    getFileDownloadUrl: notImplemented as Adaptor["getFileDownloadUrl"],
    selectFiles: notImplemented as Adaptor["selectFiles"],
    openModal: notImplemented as Adaptor["openModal"],
    setOpenInAppUrl: notImplemented as Adaptor["setOpenInAppUrl"],
    registerViewTool: notImplemented as Adaptor["registerViewTool"],
  };

  return { ...base, ...methods };
}
