import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectRequestClose } from "./inject-request-close.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

describe("injectRequestClose", () => {
  it("returns a function that calls adaptor.requestClose", async () => {
    const requestClose = spy(() => Promise.resolve());
    const adaptor = createFakeAdaptor({
      methods: { requestClose: requestClose as unknown as Adaptor["requestClose"] },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const close = runInInjectionContext(injector, () => injectRequestClose());
    await close();

    expect(requestClose.callCount()).toBe(1);
    expect(requestClose.calls[0]).toEqual([]);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectRequestClose()).toThrow();
  });
});
