import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectLayout } from "./inject-layout.js";
import { createFakeAdaptor, createFakeStore } from "./test-fakes.js";

function makeInjector(
  adaptor: ReturnType<typeof createFakeAdaptor>,
): EnvironmentInjector {
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectLayout", () => {
  it("derives theme, maxHeight, and safeArea from host context", () => {
    const theme = createFakeStore<"theme">("light");
    const maxHeight = createFakeStore<"maxHeight">(500);
    const safeArea = createFakeStore<"safeArea">({
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const adaptor = createFakeAdaptor({
      stores: {
        theme: theme.store,
        maxHeight: maxHeight.store,
        safeArea: safeArea.store,
      },
    });
    const injector = makeInjector(adaptor);

    const layout = runInInjectionContext(injector, () => injectLayout());

    expect(layout()).toEqual({
      theme: "light",
      maxHeight: 500,
      safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    });

    injector.destroy();
  });

  it("recomputes when the host pushes a new theme / maxHeight / safeArea", () => {
    const theme = createFakeStore<"theme">("light");
    const maxHeight = createFakeStore<"maxHeight">(500);
    const safeArea = createFakeStore<"safeArea">({
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const adaptor = createFakeAdaptor({
      stores: {
        theme: theme.store,
        maxHeight: maxHeight.store,
        safeArea: safeArea.store,
      },
    });
    const injector = makeInjector(adaptor);

    const layout = runInInjectionContext(injector, () => injectLayout());

    theme.push("dark");
    expect(layout().theme).toBe("dark");

    maxHeight.push(800);
    expect(layout().maxHeight).toBe(800);

    safeArea.push({ insets: { top: 44, right: 0, bottom: 34, left: 0 } });
    expect(layout().safeArea.insets.top).toBe(44);
    expect(layout().safeArea.insets.bottom).toBe(34);

    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectLayout()).toThrow();
  });
});
