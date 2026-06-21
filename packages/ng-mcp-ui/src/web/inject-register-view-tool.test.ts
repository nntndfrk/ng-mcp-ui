import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type {
  Adaptor,
  AnyViewToolHandler,
  ViewToolConfig,
  ViewToolResult,
} from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectRegisterViewTool } from "./inject-register-view-tool.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

const okResult: ViewToolResult = {
  content: [{ type: "text", text: "ok" }],
};

/**
 * Fake registerViewTool that records the config + handler and returns a teardown
 * spy, so the test can assert registration and unregistration.
 */
function makeRegistry() {
  const teardown = spy();
  const registered: { config: ViewToolConfig; handler: AnyViewToolHandler }[] =
    [];
  const registerViewTool = ((
    config: ViewToolConfig,
    handler: AnyViewToolHandler,
  ) => {
    registered.push({ config, handler });
    return teardown;
  }) as Adaptor["registerViewTool"];
  return { teardown, registered, registerViewTool };
}

describe("injectRegisterViewTool", () => {
  it("registers the tool with the adaptor at call time", () => {
    const { registered, registerViewTool } = makeRegistry();
    const adaptor = createFakeAdaptor({ methods: { registerViewTool } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const config: ViewToolConfig = {
      name: "chess_make_move",
      inputSchema: {},
    };
    runInInjectionContext(injector, () =>
      injectRegisterViewTool(config, () => okResult),
    );

    expect(registered).toHaveLength(1);
    expect(registered[0]?.config.name).toBe("chess_make_move");
    injector.destroy();
  });

  it("invokes the user handler with the host args (type-erased)", async () => {
    const { registered, registerViewTool } = makeRegistry();
    const adaptor = createFakeAdaptor({ methods: { registerViewTool } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const handler = spy((..._args: unknown[]) => okResult);
    runInInjectionContext(injector, () =>
      injectRegisterViewTool(
        { name: "echo", inputSchema: {} },
        handler as unknown as (args: { san: string }) => ViewToolResult,
      ),
    );

    const wrapped = registered[0]?.handler;
    expect(wrapped).toBeDefined();
    await wrapped?.({ san: "e4" });
    expect(handler.calls).toEqual([[{ san: "e4" }]]);
    injector.destroy();
  });

  it("tears down the registration when the injector is destroyed", () => {
    const { teardown, registerViewTool } = makeRegistry();
    const adaptor = createFakeAdaptor({ methods: { registerViewTool } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    runInInjectionContext(injector, () =>
      injectRegisterViewTool({ name: "t", inputSchema: {} }, () => okResult),
    );

    expect(teardown.callCount()).toBe(0);
    injector.destroy();
    expect(teardown.callCount()).toBe(1);
  });

  it("unregister() tears down once and is idempotent vs. destroy", () => {
    const { teardown, registerViewTool } = makeRegistry();
    const adaptor = createFakeAdaptor({ methods: { registerViewTool } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const handle = runInInjectionContext(injector, () =>
      injectRegisterViewTool({ name: "t", inputSchema: {} }, () => okResult),
    );

    handle.unregister();
    expect(teardown.callCount()).toBe(1);

    // DestroyRef.onDestroy fires on injector teardown, but unregister() guards
    // against a double teardown.
    injector.destroy();
    expect(teardown.callCount()).toBe(1);
  });

  it("throws outside an injection context", () => {
    expect(() =>
      injectRegisterViewTool({ name: "t", inputSchema: {} }, () => okResult),
    ).toThrow();
  });
});
