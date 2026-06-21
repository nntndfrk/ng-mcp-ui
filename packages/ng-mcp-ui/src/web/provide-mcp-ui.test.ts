import {
  type EnvironmentInjector,
  Injector,
  createEnvironmentInjector,
} from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppsSdkAdaptor } from "./bridges/apps-sdk/adaptor.js";
import { AppsSdkBridge } from "./bridges/apps-sdk/bridge.js";
import { McpAppAdaptor } from "./bridges/mcp-app/adaptor.js";
import { McpAppBridge } from "./bridges/mcp-app/bridge.js";
import type { Adaptor } from "./bridges/types.js";
import {
  MCP_ADAPTOR,
  MCP_SERVER_URL,
  bootstrapWidget,
  provideMcpUi,
} from "./provide-mcp-ui.js";

// `bootstrapWidget` dynamically imports `@angular/platform-browser` and calls
// `createApplication().bootstrap(component, "#root")`. We can't really boot
// Angular in the no-DOM vitest env, so mock the platform module: the spy lets us
// assert the mount target without a browser. `vi.hoisted` makes the spies
// available to the hoisted `vi.mock` factory.
const { bootstrapSpy, createApplicationMock } = vi.hoisted(() => {
  const bootstrapSpy = vi.fn();
  return {
    bootstrapSpy,
    createApplicationMock: vi.fn(async () => ({ bootstrap: bootstrapSpy })),
  };
});

vi.mock("@angular/platform-browser", () => ({
  createApplication: createApplicationMock,
}));

/**
 * Build an EnvironmentInjector from provideMcpUi()'s providers.
 * `createEnvironmentInjector` (unlike `Injector.create`) accepts
 * `EnvironmentProviders`, so the zoneless providers and the
 * `makeEnvironmentProviders()` bundle resolve correctly. A plain
 * `Injector.create()` result is an acceptable parent at runtime.
 */
function injectorFromProvideMcpUi(
  extra: Parameters<typeof createEnvironmentInjector>[0] = [],
): EnvironmentInjector {
  const parent = Injector.create({ providers: [] }) as EnvironmentInjector;
  return createEnvironmentInjector([provideMcpUi(), ...extra], parent);
}

/**
 * The mcp-app adaptor eagerly constructs the ext-apps `App` transport, which on
 * the no-DOM vitest env touches `window.parent`/`document`/`ResizeObserver`/
 * `requestAnimationFrame`. Install minimal fakes (same shape the bridge tests
 * use) so `getAdaptor()` for mcp-app can construct without a real DOM.
 */
function installMcpAppWindow(serverUrl: string): void {
  const parent = { postMessage: () => {} };
  vi.stubGlobal("window", {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    innerWidth: 0,
    parent,
    mcpUi: { hostType: "mcp-app", serverUrl },
  });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const element = {
    style: {} as Record<string, string>,
    getBoundingClientRect: () => ({ height: 0 }),
    setAttribute: () => {},
    classList: { contains: () => false },
  };
  vi.stubGlobal("document", { documentElement: element, body: element });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

describe("provideMcpUi", () => {
  beforeEach(() => {
    // Each test starts from a clean adaptor/bridge singleton state.
    AppsSdkAdaptor.resetInstance();
    AppsSdkBridge.resetInstance();
    McpAppAdaptor.resetInstance();
    McpAppBridge.resetInstance();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    AppsSdkAdaptor.resetInstance();
    AppsSdkBridge.resetInstance();
    McpAppAdaptor.resetInstance();
    McpAppBridge.resetInstance();
  });

  describe("(a) factories resolve from window.mcpUi", () => {
    it("mcp-app host → MCP_SERVER_URL + McpAppAdaptor", () => {
      installMcpAppWindow("https://x");

      const injector = injectorFromProvideMcpUi();

      expect(injector.get(MCP_SERVER_URL)).toBe("https://x");
      expect(injector.get(MCP_ADAPTOR)).toBeInstanceOf(McpAppAdaptor);

      injector.destroy();
    });

    it("apps-sdk host → MCP_SERVER_URL + AppsSdkAdaptor", () => {
      // AppsSdkBridge.getInstance() requires window.openai to be present.
      vi.stubGlobal("window", {
        mcpUi: { hostType: "apps-sdk", serverUrl: "https://y" },
        openai: {},
      });

      const injector = injectorFromProvideMcpUi();

      expect(injector.get(MCP_SERVER_URL)).toBe("https://y");
      expect(injector.get(MCP_ADAPTOR)).toBeInstanceOf(AppsSdkAdaptor);

      injector.destroy();
    });
  });

  describe("(b) missing window.mcpUi", () => {
    it("MCP_SERVER_URL resolves to '' when window has no mcpUi runtime", () => {
      vi.stubGlobal("window", {});
      const injector = injectorFromProvideMcpUi();
      expect(injector.get(MCP_SERVER_URL)).toBe("");
      injector.destroy();
    });

    it("MCP_SERVER_URL resolves to '' when window itself is undefined", () => {
      // No window stubbed: the guarded factory must not throw.
      const injector = injectorFromProvideMcpUi();
      expect(injector.get(MCP_SERVER_URL)).toBe("");
      injector.destroy();
    });

    it("MCP_ADAPTOR factory throws a clear shell-contract error", () => {
      vi.stubGlobal("window", {});
      const injector = injectorFromProvideMcpUi();
      // Decision: the adaptor factory throws (vs returning a null adaptor) so a
      // misconfigured shell fails loudly at first injection, naming the contract.
      // Resolve once: Angular caches the thrown provider as CIRCULAR on retry.
      expect(() => injector.get(MCP_ADAPTOR)).toThrow(/window\.mcpUi/);
      injector.destroy();
    });

    it("MCP_ADAPTOR error names hostType / serverUrl contract", () => {
      vi.stubGlobal("window", {});
      const injector = injectorFromProvideMcpUi();
      expect(() => injector.get(MCP_ADAPTOR)).toThrow(/hostType/);
      injector.destroy();
    });
  });

  describe("(c) MCP_ADAPTOR is overridable without window (the mock seam)", () => {
    it("a fake adaptor provided via the token wins; no window read", () => {
      // No window.mcpUi: if provideMcpUi's factory leaked, this would throw.
      const fake = { marker: "fake" } as unknown as Adaptor;
      const injector = injectorFromProvideMcpUi([
        { provide: MCP_ADAPTOR, useValue: fake },
      ]);

      expect(injector.get(MCP_ADAPTOR)).toBe(fake);

      injector.destroy();
    });
  });

  describe("(d) bootstrapWidget mounts into the shell's '#root'", () => {
    it("bootstraps the component into '#root', not its own selector (guards NG05104)", async () => {
      // The host shell renders `<div id="root">`, which never matches a
      // widget's `*-widget` selector. `bootstrapApplication(component)` keyed off
      // the selector and threw NG05104 ("selector did not match any elements"),
      // leaving the iframe blank. `bootstrapWidget` must mount into `#root`
      // explicitly so any selector works. (A plain class stands in for the
      // widget — the selector mismatch is enforced by Angular at real bootstrap,
      // which is mocked here; this guards the call contract.)
      class Widget {}

      const appRef = await bootstrapWidget(Widget);

      expect(createApplicationMock).toHaveBeenCalledOnce();
      expect(bootstrapSpy).toHaveBeenCalledWith(Widget, "#root");
      // Resolves to the booted ApplicationRef (the mock's stand-in).
      expect(appRef).toBe(await createApplicationMock.mock.results[0]?.value);
    });
  });
});
