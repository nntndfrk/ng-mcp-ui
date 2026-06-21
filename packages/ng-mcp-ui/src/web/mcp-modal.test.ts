import { type EnvironmentInjector, Injector } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Adaptor,
  HostContext,
  HostContextStore,
} from "./bridges/types.js";
import {
  createMcpModal,
  MCP_MODAL,
  MCP_MODAL_ENABLED,
  provideMcpModal,
} from "./mcp-modal.js";
import { MCP_ADAPTOR } from "./tokens.js";

// Inline test fakes (a shared `test-fakes.ts` lands with the S12 inject* suites
// that need it; this single suite keeps them local, mirroring host-context.test.ts).

/** Minimal call-recording spy (no vitest dependency). */
type Spy<Args extends unknown[] = unknown[], R = unknown> = ((
  ...args: Args
) => R) & { calls: Args[]; callCount: () => number };

function spy<Args extends unknown[] = unknown[], R = unknown>(
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
function createFakeStore<K extends keyof HostContext>(
  initial: HostContext[K],
): {
  store: HostContextStore<K>;
  push: (next: HostContext[K]) => void;
  unsubscribe: Spy;
  listenerCount: () => number;
} {
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

function createFakeAdaptor(
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

describe("createMcpModal", () => {
  it("open/close round-trip: display.mode drives isOpen; close() calls closeModal() (local flip to inline)", () => {
    const display = createFakeStore<"display">({ mode: "inline" });
    // Mirrors the concrete McpAppAdaptor.closeModal(): a local flip of the
    // display store back to inline (no host round-trip).
    const closeModal = spy(() => {
      display.push({ mode: "inline" });
    });
    const adaptor: Adaptor = {
      ...createFakeAdaptor({ stores: { display: display.store } }),
      closeModal,
    } as Adaptor;

    const modal = createMcpModal(adaptor, true);

    // Starts closed.
    expect(modal.isOpen()).toBe(false);

    // Host opens the modal → isOpen tracks display.mode === "modal".
    display.push({ mode: "modal", params: { from: "test" } });
    expect(modal.isOpen()).toBe(true);

    // close() calls the concrete closeModal() (local optimistic flip), which
    // pushes display back to inline → isOpen synchronously false.
    modal.close();
    expect(closeModal.callCount()).toBe(1);
    expect(modal.isOpen()).toBe(false);
  });

  it("no-ops when disabled (non-mcp-app host): isOpen stays false, store untouched", () => {
    const display = createFakeStore<"display">({ mode: "modal" });
    const adaptor = createFakeAdaptor({ stores: { display: display.store } });

    const modal = createMcpModal(adaptor, false);

    // Even though the host reports "modal", the disabled modal reports closed
    // and never subscribed to the display store.
    expect(modal.isOpen()).toBe(false);
    expect(display.listenerCount()).toBe(0);
  });
});

describe("provideMcpModal", () => {
  it("resolves MCP_MODAL and supports an open/close round-trip for an mcp-app host", () => {
    const display = createFakeStore<"display">({ mode: "inline" });
    const closeModal = spy(() => {
      display.push({ mode: "inline" });
    });
    const adaptor: Adaptor = {
      ...createFakeAdaptor({ stores: { display: display.store } }),
      closeModal,
    } as Adaptor;

    const injector = Injector.create({
      providers: [
        { provide: MCP_ADAPTOR, useValue: adaptor },
        // Override placed AFTER provideMcpModal() so it wins (last provider for a
        // token wins — same seam as provideMcpUi + a MCP_ADAPTOR override).
        provideMcpModal(),
        { provide: MCP_MODAL_ENABLED, useValue: true },
      ],
    }) as EnvironmentInjector;

    const modal = injector.get(MCP_MODAL);
    expect(display.listenerCount()).toBe(1);

    expect(modal.isOpen()).toBe(false);
    display.push({ mode: "modal" });
    expect(modal.isOpen()).toBe(true);

    modal.close();
    expect(closeModal.callCount()).toBe(1);
    expect(modal.isOpen()).toBe(false);

    injector.destroy();
    expect(display.listenerCount()).toBe(0);
  });

  it("disabled host: the boot initializer skips MCP_MODAL (does not resolve MCP_ADAPTOR)", () => {
    // The gate is false (no window stubbed) and NO MCP_ADAPTOR is provided. If
    // the boot initializer resolved MCP_MODAL it would inject the absent
    // MCP_ADAPTOR and throw at injector creation. Creation succeeding proves the
    // initializer no-ops on a non-mcp-app host.
    expect(() =>
      Injector.create({
        providers: [provideMcpModal()],
      }).destroy(),
    ).not.toThrow();
  });

  it("disabled host: MCP_MODAL itself is a no-op (isOpen false, store untouched)", () => {
    const display = createFakeStore<"display">({ mode: "modal" });
    const adaptor = createFakeAdaptor({ stores: { display: display.store } });

    const injector = Injector.create({
      providers: [
        { provide: MCP_ADAPTOR, useValue: adaptor },
        provideMcpModal(),
        { provide: MCP_MODAL_ENABLED, useValue: false },
      ],
    }) as EnvironmentInjector;

    const modal = injector.get(MCP_MODAL);
    expect(modal.isOpen()).toBe(false);
    expect(display.listenerCount()).toBe(0);

    injector.destroy();
  });

  it("provideMcpModal() provides MCP_MODAL_ENABLED as false when window.mcpUi is absent", () => {
    // No window stub: the factory must resolve false (SSR/test no-op), not throw.
    const injector = Injector.create({
      providers: [provideMcpModal()],
    }) as EnvironmentInjector;
    expect(injector.get(MCP_MODAL_ENABLED)).toBe(false);
    injector.destroy();
  });
});

describe("createMcpModal Escape-key listener lifecycle (DI)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the keydown listener on injector destroy (not leaked across lifetimes)", () => {
    // Stub a DOM so the Escape-to-close branch runs (node has no `document`).
    const keydownHandlers: Array<(e: KeyboardEvent) => void> = [];
    const addEventListener = spy((type: string, h: (e: KeyboardEvent) => void) => {
      if (type === "keydown") {
        keydownHandlers.push(h);
      }
    });
    const removeEventListener = spy();
    vi.stubGlobal("document", { addEventListener, removeEventListener });

    const display = createFakeStore<"display">({ mode: "inline" });
    const closeModal = spy(() => {
      display.push({ mode: "inline" });
    });
    const adaptor: Adaptor = {
      ...createFakeAdaptor({ stores: { display: display.store } }),
      closeModal,
    } as Adaptor;

    const injector = Injector.create({
      providers: [
        { provide: MCP_ADAPTOR, useValue: adaptor },
        provideMcpModal(),
        { provide: MCP_MODAL_ENABLED, useValue: true },
      ],
    }) as EnvironmentInjector;

    // Resolving MCP_MODAL (in the injector's context) wires the keydown listener.
    injector.get(MCP_MODAL);
    expect(addEventListener.callCount()).toBe(1);
    expect(addEventListener.calls[0]?.[0]).toBe("keydown");
    const handler = keydownHandlers[0];

    // Escape while open closes the modal.
    display.push({ mode: "modal" });
    handler?.({ key: "Escape" } as KeyboardEvent);
    expect(closeModal.callCount()).toBe(1);

    // The listener is removed when the injector is destroyed (the bug: the old
    // `ctx.destroy` monkeypatch was never invoked by DestroyRef, so it leaked).
    injector.destroy();
    expect(removeEventListener.callCount()).toBe(1);
    expect(removeEventListener.calls[0]?.[0]).toBe("keydown");
    expect(removeEventListener.calls[0]?.[1]).toBe(handler);
  });
});
