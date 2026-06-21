import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { UserAgent } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectUser } from "./inject-user.js";
import { createFakeAdaptor, createFakeStore } from "./test-fakes.js";

const mobileAgent: UserAgent = {
  device: { type: "mobile" },
  capabilities: { hover: false, touch: true },
};

function makeInjector(
  locale: string,
  userAgent?: UserAgent,
): { injector: EnvironmentInjector; localeStore: ReturnType<typeof createFakeStore<"locale">> } {
  const localeStore = createFakeStore<"locale">(locale);
  const stores: Parameters<typeof createFakeAdaptor>[0] = {
    stores: { locale: localeStore.store },
  };
  if (userAgent) {
    stores.stores = {
      ...stores.stores,
      userAgent: createFakeStore<"userAgent">(userAgent).store,
    };
  }
  const adaptor = createFakeAdaptor(stores);
  const injector = Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
  return { injector, localeStore };
}

describe("injectUser", () => {
  it("returns locale and userAgent from host context", () => {
    const { injector } = makeInjector("en-US", mobileAgent);
    const user = runInInjectionContext(injector, () => injectUser());

    expect(user().locale).toBe("en-US");
    expect(user().userAgent).toEqual(mobileAgent);

    injector.destroy();
  });

  it("normalizes underscore locale to BCP 47 hyphen format", () => {
    const { injector } = makeInjector("fr_FR");
    const user = runInInjectionContext(injector, () => injectUser());
    expect(user().locale).toBe("fr-FR");
    injector.destroy();
  });

  it("canonicalizes locale casing", () => {
    const { injector } = makeInjector("en-us");
    const user = runInInjectionContext(injector, () => injectUser());
    expect(user().locale).toBe("en-US");
    injector.destroy();
  });

  it("falls back to en-US for an invalid locale", () => {
    const { injector } = makeInjector("not-a-locale-!!");
    const user = runInInjectionContext(injector, () => injectUser());
    expect(user().locale).toBe("en-US");
    injector.destroy();
  });

  it("re-normalizes when the host pushes a new locale", () => {
    const { injector, localeStore } = makeInjector("en-US");
    const user = runInInjectionContext(injector, () => injectUser());
    expect(user().locale).toBe("en-US");

    localeStore.push("zh_Hans_CN");
    expect(user().locale).toBe("zh-Hans-CN");

    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectUser()).toThrow();
  });
});
