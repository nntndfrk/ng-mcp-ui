import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectSetOpenInAppUrl } from "./inject-set-open-in-app-url.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

describe("injectSetOpenInAppUrl", () => {
  it("forwards the href to adaptor.setOpenInAppUrl", async () => {
    const setOpenInAppUrl = spy(() => Promise.resolve());
    const adaptor = createFakeAdaptor({
      methods: {
        setOpenInAppUrl:
          setOpenInAppUrl as unknown as Adaptor["setOpenInAppUrl"],
      },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const fn = runInInjectionContext(injector, () => injectSetOpenInAppUrl());
    await fn("https://example.com/path");

    expect(setOpenInAppUrl.calls).toEqual([["https://example.com/path"]]);
    injector.destroy();
  });

  it("propagates the adaptor's validation error (e.g. empty href)", async () => {
    const setOpenInAppUrl = spy(() => {
      throw new Error("The href parameter is required.");
    });
    const adaptor = createFakeAdaptor({
      methods: {
        setOpenInAppUrl:
          setOpenInAppUrl as unknown as Adaptor["setOpenInAppUrl"],
      },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const fn = runInInjectionContext(injector, () => injectSetOpenInAppUrl());
    expect(() => fn("")).toThrow("The href parameter is required.");
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectSetOpenInAppUrl()).toThrow();
  });
});
