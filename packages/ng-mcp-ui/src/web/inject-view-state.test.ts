import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { VIEW_CONTEXT_KEY } from "./helpers/state.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectViewState } from "./inject-view-state.js";
import { createFakeAdaptor, createFakeStore, spy } from "./test-fakes.js";

type State = { count: number; name: string };

const defaultState: State = { count: 0, name: "test" };
const windowState: State = { count: 5, name: "window" };

/**
 * Wire a fake adaptor with a controllable `viewState` store and a `setViewState`
 * spy. Returns helpers to push host state and assert persistence.
 */
function setup(initialViewState: Record<string, unknown> | null = null) {
  const view = createFakeStore<"viewState">(initialViewState);
  const setViewState = spy(() => Promise.resolve());
  const adaptor = createFakeAdaptor({
    stores: { viewState: view.store },
    methods: { setViewState: setViewState as unknown as Adaptor["setViewState"] },
  });
  const injector = Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
  return { view, setViewState, injector };
}

describe("injectViewState", () => {
  it("initializes with the default state when host viewState is null", () => {
    const { injector } = setup(null);
    const { value } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );
    expect(value()).toEqual(defaultState);
    injector.destroy();
  });

  it("initializes from host viewState when present (filtered)", () => {
    const { injector } = setup({ ...windowState, [VIEW_CONTEXT_KEY]: "ctx" });
    const { value } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );
    expect(value()).toEqual(windowState);
    injector.destroy();
  });

  it("supports a lazy default initializer", () => {
    const { injector } = setup(null);
    const { value } = runInInjectionContext(injector, () =>
      injectViewState<State>(() => ({ count: 7, name: "lazy" })),
    );
    expect(value()).toEqual({ count: 7, name: "lazy" });
    injector.destroy();
  });

  it("set(value) persists via adaptor.setViewState and updates value", () => {
    const { setViewState, injector } = setup(null);
    const { value, set } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );

    const newState: State = { count: 10, name: "updated" };
    set(newState);

    expect(setViewState.calls).toEqual([[newState]]);
    expect(value()).toEqual(newState);
    injector.destroy();
  });

  it("set(updater) sees the previous state", () => {
    const { setViewState, injector } = setup(null);
    const { value, set } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );

    set((prev) => ({ ...(prev as State), count: (prev as State).count + 1 }));

    expect(setViewState.calls).toEqual([[{ count: 1, name: "test" }]]);
    expect(value()).toEqual({ count: 1, name: "test" });
    injector.destroy();
  });

  it("adopts a non-null host push (filtered)", () => {
    const { view, injector } = setup({ modelContent: 0 });
    const { value } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );

    view.push({ ...windowState, [VIEW_CONTEXT_KEY]: "ctx" });
    expect(value()).toEqual(windowState);
    injector.destroy();
  });

  it("ignores a null host push (does not wipe local state)", () => {
    const { view, injector } = setup(null);
    const { value, set } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );
    set({ count: 3, name: "local" });
    expect(value()).toEqual({ count: 3, name: "local" });

    view.push(null);
    expect(value()).toEqual({ count: 3, name: "local" });
    injector.destroy();
  });

  it("re-attaches the host's view-context onto persisted state", () => {
    const { setViewState, injector } = setup({
      old: true,
      [VIEW_CONTEXT_KEY]: { llm: "payload" },
    });
    const { value, set } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );

    set({ count: 9, name: "x" });

    // setViewState receives the context merged back in...
    expect(setViewState.calls).toEqual([
      [{ count: 9, name: "x", [VIEW_CONTEXT_KEY]: { llm: "payload" } }],
    ]);
    // ...but the local value signal is filtered.
    expect(value()).toEqual({ count: 9, name: "x" });
    injector.destroy();
  });

  it("does not persist when the injected state is null", () => {
    const { setViewState, injector } = setup(null);
    const { value, set } = runInInjectionContext(injector, () =>
      injectViewState<State>(defaultState),
    );

    set(null);

    expect(setViewState.callCount()).toBe(0);
    expect(value()).toBeNull();
    injector.destroy();
  });

  it("unsubscribes from the host store on destroy", () => {
    const { view, injector } = setup(null);
    runInInjectionContext(injector, () => injectViewState<State>(defaultState));
    expect(view.listenerCount()).toBe(1);

    injector.destroy();
    expect(view.unsubscribe.callCount()).toBe(1);
    expect(view.listenerCount()).toBe(0);
  });

  it("throws outside an injection context", () => {
    expect(() => injectViewState<State>(defaultState)).toThrow();
  });
});
