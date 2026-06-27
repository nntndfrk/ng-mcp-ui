import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { VIEW_CONTEXT_KEY } from "./helpers/state.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectViewStore } from "./inject-view-store.js";
import { createFakeAdaptor, createFakeStore, spy } from "./test-fakes.js";

type State = { count: number; name: string };

const defaultState: State = { count: 0, name: "test" };
const windowState: State = { count: 5, name: "window" };

/**
 * Wire a fake adaptor with a controllable `viewState` store and a `setViewState`
 * spy. `setViewState` echoes the write back onto the store (like the real
 * adaptor), so the conflict-guard path is exercised.
 */
function setup(initialViewState: Record<string, unknown> | null = null) {
  const view = createFakeStore<"viewState">(initialViewState);
  const setViewState = spy((next: unknown) => {
    // Mirror the real adaptor: persisting a value re-notifies the store.
    view.push(next as Record<string, unknown> | null);
    return Promise.resolve();
  });
  const adaptor = createFakeAdaptor({
    stores: { viewState: view.store },
    methods: {
      setViewState: setViewState as unknown as Adaptor["setViewState"],
    },
  });
  const injector = Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
  return { view, setViewState, injector };
}

describe("injectViewStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) initializes with null when no default and host viewState is null", () => {
    const { injector } = setup(null);
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(),
    );
    expect(state()).toBeNull();
    injector.destroy();
  });

  it("(b) initializes with the initial state when host viewState is null", () => {
    const { injector } = setup(null);
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    expect(state()).toEqual(defaultState);
    injector.destroy();
  });

  it("(b') falls back to defaultState when the creator resolves to null", () => {
    const { injector } = setup(null);
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(null, () => ({ count: 9, name: "fallback" })),
    );
    expect(state()).toEqual({ count: 9, name: "fallback" });
    injector.destroy();
  });

  it("(c) seeds from host viewState when present (filtered)", () => {
    const { injector } = setup({ ...windowState, [VIEW_CONTEXT_KEY]: "ctx" });
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    expect(state()).toEqual(windowState);
    injector.destroy();
  });

  it("(d) set() persists via setViewState (debounced) and updates state", () => {
    const { setViewState, injector } = setup(null);
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    const newState: State = { count: 10, name: "updated" };
    set(newState);

    // Optimistic local update is synchronous...
    expect(state()).toEqual(newState);
    // ...but the host write is debounced (nothing yet).
    expect(setViewState.callCount()).toBe(0);

    vi.runAllTimers();
    expect(setViewState.calls).toEqual([[newState]]);
    injector.destroy();
  });

  it("(d) update()/patch() shallow-merge onto the previous state", () => {
    const { setViewState, injector } = setup(null);
    const { state, update, patch } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    update({ count: 3 });
    expect(state()).toEqual({ count: 3, name: "test" });
    patch((prev) => ({ name: `${prev?.name}!` }));
    expect(state()).toEqual({ count: 3, name: "test!" });

    vi.runAllTimers();
    // Coalesced into a single host write of the final value.
    expect(setViewState.calls).toEqual([[{ count: 3, name: "test!" }]]);
    injector.destroy();
  });

  it("(d) coalesces a burst of rapid writes into one setViewState", () => {
    const { setViewState, injector } = setup(null);
    const { set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 1, name: "a" });
    set({ count: 2, name: "b" });
    set({ count: 3, name: "c" });

    vi.runAllTimers();
    expect(setViewState.callCount()).toBe(1);
    expect(setViewState.calls[0]).toEqual([{ count: 3, name: "c" }]);
    injector.destroy();
  });

  it("(d) flush() persists immediately and cancels the pending timer", () => {
    const { setViewState, injector } = setup(null);
    const { set, flush } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 7, name: "now" });
    expect(setViewState.callCount()).toBe(0);
    flush();
    expect(setViewState.calls).toEqual([[{ count: 7, name: "now" }]]);

    // Timer already cancelled — running timers does not re-fire.
    vi.runAllTimers();
    expect(setViewState.callCount()).toBe(1);
    injector.destroy();
  });

  it("(d) re-attaches the host's view-context onto the persisted state", () => {
    const { setViewState, injector } = setup({
      old: true,
      [VIEW_CONTEXT_KEY]: { llm: "payload" },
    });
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 9, name: "x" });
    vi.runAllTimers();

    // Persisted payload carries the context back in...
    expect(setViewState.calls[0]).toEqual([
      { count: 9, name: "x", [VIEW_CONTEXT_KEY]: { llm: "payload" } },
    ]);
    // ...but the exposed state is filtered.
    expect(state()).toEqual({ count: 9, name: "x" });
    injector.destroy();
  });

  it("(d) does not persist a caller-supplied reserved VIEW_CONTEXT_KEY", () => {
    // The reserved key is host-internal: a caller writing it must not reach the
    // host. The persisted payload carries only the host's own context (here:
    // none), never the caller's value, and the exposed state is filtered.
    const { setViewState, injector } = setup(null);
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 1, name: "x", [VIEW_CONTEXT_KEY]: "sneaky" } as State);
    vi.runAllTimers();

    expect(setViewState.calls).toEqual([[{ count: 1, name: "x" }]]);
    expect(
      (state() as Record<string, unknown>)[VIEW_CONTEXT_KEY],
    ).toBeUndefined();
    injector.destroy();
  });

  it("(d) set(null) clears local state but does not persist (no null host write)", () => {
    const { setViewState, injector } = setup(null);
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    expect(state()).toEqual(defaultState);

    set(null);
    expect(state()).toBeNull();

    vi.runAllTimers();
    // `adaptor.setViewState` has no null form, so a null clear never persists.
    expect(setViewState.callCount()).toBe(0);
    injector.destroy();
  });

  it("(e) rehydrates from an external host push that differs (filtered)", () => {
    const { view, injector } = setup({ seed: 0 });
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    view.push({ ...windowState, [VIEW_CONTEXT_KEY]: "ctx" });
    expect(state()).toEqual(windowState);
    injector.destroy();
  });

  it("(f) does NOT rehydrate when the external push deep-equals current state", () => {
    const { view, injector } = setup(null);
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 4, name: "local" });
    vi.runAllTimers();
    const before = state();

    // External push equal (after filtering) to the current state — the
    // deepEqual guard suppresses the rehydrate so there is no echo loop.
    view.push({ count: 4, name: "local", [VIEW_CONTEXT_KEY]: "ctx" });
    expect(state()).toBe(before);
    expect(state()).toEqual({ count: 4, name: "local" });
    injector.destroy();
  });

  it("(f) a write's own echo does not produce an extra setViewState", () => {
    // setViewState echoes back onto the store (see setup). The conflict guard
    // means the echo is dropped and no second write is scheduled.
    const { setViewState, injector } = setup(null);
    const { set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );

    set({ count: 1, name: "x" });
    vi.runAllTimers();
    vi.runAllTimers();
    expect(setViewState.callCount()).toBe(1);
    injector.destroy();
  });

  it("ignores a null host push (does not wipe local state)", () => {
    const { view, injector } = setup(null);
    const { state, set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    set({ count: 3, name: "local" });
    vi.runAllTimers();

    view.push(null);
    expect(state()).toEqual({ count: 3, name: "local" });
    injector.destroy();
  });

  it("(g) filters the host-internal VIEW_CONTEXT_KEY out of the exposed state", () => {
    const { injector } = setup({
      count: 5,
      name: "ctx",
      [VIEW_CONTEXT_KEY]: "context-value",
    });
    const { state } = runInInjectionContext(injector, () =>
      injectViewStore<State>(),
    );
    expect(state()).toEqual({ count: 5, name: "ctx" });
    expect((state() as Record<string, unknown>)[VIEW_CONTEXT_KEY]).toBeUndefined();
    injector.destroy();
  });

  it("select() derives a memoized signal that tracks state", () => {
    const { injector } = setup(null);
    const { set, select } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    const count = select((s) => s?.count ?? -1);
    expect(count()).toBe(0);

    set({ count: 42, name: "x" });
    expect(count()).toBe(42);
    injector.destroy();
  });

  it("unsubscribes from the host store on destroy", () => {
    const { view, injector } = setup(null);
    runInInjectionContext(injector, () => injectViewStore<State>(defaultState));
    expect(view.listenerCount()).toBe(1);

    injector.destroy();
    expect(view.unsubscribe.callCount()).toBe(1);
    expect(view.listenerCount()).toBe(0);
  });

  it("flushes a pending write on destroy", () => {
    const { setViewState, injector } = setup(null);
    const { set } = runInInjectionContext(injector, () =>
      injectViewStore<State>(defaultState),
    );
    set({ count: 99, name: "last" });
    expect(setViewState.callCount()).toBe(0);

    injector.destroy();
    expect(setViewState.calls).toEqual([[{ count: 99, name: "last" }]]);
  });

  it("throws outside an injection context", () => {
    expect(() => injectViewStore<State>(defaultState)).toThrow();
  });
});
