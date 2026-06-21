import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectOpenExternal } from "./inject-open-external.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

describe("injectOpenExternal", () => {
  it("returns a function that forwards href to adaptor.openExternal", () => {
    const openExternal = spy();
    const adaptor = createFakeAdaptor({
      methods: { openExternal: openExternal as unknown as Adaptor["openExternal"] },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const open = runInInjectionContext(injector, () => injectOpenExternal());
    open("https://example.com");

    expect(openExternal.calls).toEqual([["https://example.com", undefined]]);
    injector.destroy();
  });

  it("forwards the redirectUrl option", () => {
    const openExternal = spy();
    const adaptor = createFakeAdaptor({
      methods: { openExternal: openExternal as unknown as Adaptor["openExternal"] },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const open = runInInjectionContext(injector, () => injectOpenExternal());
    open("https://example.com", { redirectUrl: false });

    expect(openExternal.calls).toEqual([
      ["https://example.com", { redirectUrl: false }],
    ]);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectOpenExternal()).toThrow();
  });
});
