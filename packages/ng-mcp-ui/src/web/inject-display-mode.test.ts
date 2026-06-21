import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectDisplayMode } from "./inject-display-mode.js";
import { createFakeAdaptor, createFakeStore, spy } from "./test-fakes.js";

describe("injectDisplayMode", () => {
  it("returns the current display mode from host context", () => {
    const display = createFakeStore<"displayMode">("inline");
    const adaptor = createFakeAdaptor({
      stores: { displayMode: display.store },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { displayMode } = runInInjectionContext(injector, () =>
      injectDisplayMode(),
    );
    expect(displayMode()).toBe("inline");

    injector.destroy();
  });

  it("updates the signal when the host changes the display mode", () => {
    const display = createFakeStore<"displayMode">("inline");
    const adaptor = createFakeAdaptor({
      stores: { displayMode: display.store },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { displayMode } = runInInjectionContext(injector, () =>
      injectDisplayMode(),
    );
    expect(displayMode()).toBe("inline");

    display.push("fullscreen");
    expect(displayMode()).toBe("fullscreen");

    injector.destroy();
  });

  it("setDisplayMode forwards to adaptor.requestDisplayMode and resolves with the applied mode", async () => {
    const requestDisplayMode = spy(() =>
      Promise.resolve({ mode: "fullscreen" as const }),
    );
    const adaptor = createFakeAdaptor({
      methods: {
        requestDisplayMode:
          requestDisplayMode as unknown as Adaptor["requestDisplayMode"],
      },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { setDisplayMode } = runInInjectionContext(injector, () =>
      injectDisplayMode(),
    );
    const applied = await setDisplayMode("fullscreen");

    expect(requestDisplayMode.calls).toEqual([["fullscreen"]]);
    expect(applied).toEqual({ mode: "fullscreen" });

    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectDisplayMode()).toThrow();
  });
});
