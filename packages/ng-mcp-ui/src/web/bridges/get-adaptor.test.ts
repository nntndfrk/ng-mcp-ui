import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppsSdkAdaptor } from "./apps-sdk/adaptor.js";
import { AppsSdkBridge } from "./apps-sdk/bridge.js";
import { getAdaptor } from "./get-adaptor.js";
import { McpAppAdaptor } from "./mcp-app/adaptor.js";
import { McpAppBridge } from "./mcp-app/bridge.js";

// getAdaptor() is the single host-selection branch. Resolving the mcp-app
// adaptor constructs the ext-apps `App` (which touches window.parent/document/
// requestAnimationFrame/ResizeObserver on connect), so install the same minimal
// browser surface the mcp-app view-tools suite uses, keyed by hostType.
// `eventTarget` is recreated per install so a leaked listener from a prior
// test's App can't fire on this one's dispatches.
let eventTarget = new EventTarget();

function installHostMock(hostType: string): void {
  eventTarget = new EventTarget();
  const parent = { postMessage: () => {} };
  vi.stubGlobal("window", {
    mcpUi: { hostType },
    openai: {},
    parent,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    innerWidth: 0,
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

beforeEach(() => {
  AppsSdkAdaptor.resetInstance();
  AppsSdkBridge.resetInstance();
  McpAppAdaptor.resetInstance();
  McpAppBridge.resetInstance();
});

afterEach(() => {
  AppsSdkAdaptor.resetInstance();
  AppsSdkBridge.resetInstance();
  McpAppAdaptor.resetInstance();
  McpAppBridge.resetInstance();
  vi.unstubAllGlobals();
});

describe("getAdaptor", () => {
  it("resolves the AppsSdkAdaptor singleton for an apps-sdk host", () => {
    installHostMock("apps-sdk");
    const adaptor = getAdaptor();
    expect(adaptor).toBeInstanceOf(AppsSdkAdaptor);
    expect(adaptor).toBe(AppsSdkAdaptor.getInstance());
  });

  it("resolves the McpAppAdaptor singleton for an mcp-app host", () => {
    installHostMock("mcp-app");
    const adaptor = getAdaptor();
    expect(adaptor).toBeInstanceOf(McpAppAdaptor);
    expect(adaptor).toBe(McpAppAdaptor.getInstance());
  });

  it("throws a clear error for an unknown host type", () => {
    installHostMock("gemini");
    expect(() => getAdaptor()).toThrow(/Unknown host type "gemini"/);
  });
});
