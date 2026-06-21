import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectRequestSize } from "./inject-request-size.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

function makeInjector(method: ReturnType<typeof spy>): EnvironmentInjector {
  const adaptor = createFakeAdaptor({
    methods: { requestSize: method as unknown as Adaptor["requestSize"] },
  });
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectRequestSize", () => {
  it("forwards width + height to adaptor.requestSize", async () => {
    const requestSize = spy(() => Promise.resolve());
    const injector = makeInjector(requestSize);

    const fn = runInInjectionContext(injector, () => injectRequestSize());
    await fn({ width: 800, height: 400 });

    expect(requestSize.calls).toEqual([[{ width: 800, height: 400 }]]);
    injector.destroy();
  });

  it("forwards height-only payloads as-is", async () => {
    const requestSize = spy(() => Promise.resolve());
    const injector = makeInjector(requestSize);

    const fn = runInInjectionContext(injector, () => injectRequestSize());
    await fn({ height: 400 });

    expect(requestSize.calls).toEqual([[{ height: 400 }]]);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectRequestSize()).toThrow();
  });
});
