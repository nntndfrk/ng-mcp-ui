import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type {
  Adaptor,
  HostContext,
  HostContextStore,
} from "./bridges/types.js";
import {
  createHostContextSignals,
  injectHostContext,
} from "./host-context.js";
// MCP_ADAPTOR lives in the leaf tokens module (provide-mcp-ui re-exports it once
// it lands; until then import it straight from the leaf).
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * A controllable per-key host-context store: holds a mutable snapshot, records
 * subscribers, and lets the test `push()` a new value (firing subscribers,
 * mirroring the real adaptor stores). The returned `unsubscribe` is a spy.
 */
function createFakeStore<K extends keyof HostContext>(
  initial: HostContext[K],
): {
  store: HostContextStore<K>;
  push: (next: HostContext[K]) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  listenerCount: () => number;
} {
  let current = initial;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn(() => {});

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

/**
 * Minimal fake {@link Adaptor} wired to fake stores. Only `getHostContextStore`
 * is exercised here; the rest throw if touched so we notice accidental use.
 */
function createFakeAdaptor(
  overrides: Partial<{
    [K in keyof HostContext]: HostContextStore<K>;
  }> = {},
): Adaptor {
  const defaults: { [K in keyof HostContext]: HostContext[K] } = {
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

  return {
    getHostContextStore: (<K extends keyof HostContext>(key: K) => {
      const override = overrides[key];
      if (override) {
        return override;
      }
      return createFakeStore<K>(defaults[key]).store;
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
}

describe("createHostContextSignals", () => {
  it("(a) seeds each signal from the store's initial snapshot", () => {
    const theme = createFakeStore<"theme">("dark");
    const locale = createFakeStore<"locale">("fr-FR");
    const adaptor = createFakeAdaptor({
      theme: theme.store,
      locale: locale.store,
    });

    const ctx = createHostContextSignals(adaptor);

    expect(ctx.theme()).toBe("dark");
    expect(ctx.locale()).toBe("fr-FR");
    expect(ctx.displayMode()).toBe("inline");

    ctx.destroy();
  });

  it("(b) a host push updates the corresponding signal", () => {
    const theme = createFakeStore<"theme">("light");
    const display = createFakeStore<"display">({ mode: "inline" });
    const adaptor = createFakeAdaptor({
      theme: theme.store,
      display: display.store,
    });

    const ctx = createHostContextSignals(adaptor);
    expect(ctx.theme()).toBe("light");

    theme.push("dark");
    expect(ctx.theme()).toBe("dark");

    display.push({ mode: "fullscreen", params: { from: "test" } });
    expect(ctx.display()).toEqual({
      mode: "fullscreen",
      params: { from: "test" },
    });

    ctx.destroy();
  });

  it("exposes readonly signals (no .set surface)", () => {
    const ctx = createHostContextSignals(createFakeAdaptor());
    expect("set" in ctx.theme).toBe(false);
    ctx.destroy();
  });

  it("(c) destroy() unsubscribes every store subscription", () => {
    const theme = createFakeStore<"theme">("light");
    const locale = createFakeStore<"locale">("en-US");
    const adaptor = createFakeAdaptor({
      theme: theme.store,
      locale: locale.store,
    });

    const ctx = createHostContextSignals(adaptor);
    expect(theme.listenerCount()).toBe(1);
    expect(locale.listenerCount()).toBe(1);

    ctx.destroy();

    expect(theme.unsubscribe).toHaveBeenCalledTimes(1);
    expect(locale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(theme.listenerCount()).toBe(0);
    expect(locale.listenerCount()).toBe(0);

    // Idempotent: a second destroy() is a no-op.
    ctx.destroy();
    expect(theme.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("stops reacting to pushes after destroy()", () => {
    const theme = createFakeStore<"theme">("light");
    const adaptor = createFakeAdaptor({ theme: theme.store });

    const ctx = createHostContextSignals(adaptor);
    ctx.destroy();

    theme.push("dark");
    expect(ctx.theme()).toBe("light");
  });

  it("(d) wires DestroyRef cleanup inside an injection context", () => {
    const theme = createFakeStore<"theme">("light");
    const adaptor = createFakeAdaptor({ theme: theme.store });

    // injectHostContext() resolves the adaptor from MCP_ADAPTOR — provide the
    // fake via the token (no getAdaptor / no window.mcpUi), proving THE RULE.
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const ctx = runInInjectionContext(injector, () => injectHostContext());

    expect(ctx.theme()).toBe("light");
    theme.push("dark");
    expect(ctx.theme()).toBe("dark");

    // Subscription is live until the injector is destroyed.
    expect(theme.unsubscribe).not.toHaveBeenCalled();

    injector.destroy();

    expect(theme.unsubscribe).toHaveBeenCalledTimes(1);
    expect(theme.listenerCount()).toBe(0);
  });

  it("injectHostContext throws outside an injection context", () => {
    expect(() => injectHostContext()).toThrow();
  });

  it("(e) injectHostContext resolves the adaptor from MCP_ADAPTOR (no getAdaptor / no window)", () => {
    // A fake adaptor provided purely via the token: if injectHostContext
    // secretly called getAdaptor() it would touch window.mcpUi (unset here)
    // and throw. It resolving the fake's stores proves token-only resolution.
    const theme = createFakeStore<"theme">("dark");
    const adaptor = createFakeAdaptor({ theme: theme.store });

    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const ctx = runInInjectionContext(injector, () => injectHostContext());
    expect(ctx.theme()).toBe("dark");

    injector.destroy();
  });
});
