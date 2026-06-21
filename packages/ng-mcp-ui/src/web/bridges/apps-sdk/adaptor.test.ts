import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppsSdkAdaptor } from "./adaptor.js";
import { AppsSdkBridge } from "./bridge.js";
import { SET_GLOBALS_EVENT_TYPE } from "./types.js";

// Framework-free tests for the Apps SDK bridge. Vitest runs under node (no DOM),
// so we install a minimal fake `window` carrying the `openai` host API and
// `mcpUi.hostType`, plus an `EventTarget` so the bridge's `set_globals`
// subscribe/dispatch round-trip works.

type OpenAiMock = Record<string, unknown> & {
  callTool: ReturnType<typeof vi.fn>;
  setWidgetState: ReturnType<typeof vi.fn>;
};

let openai: OpenAiMock;
let events: EventTarget;

function installHostMock(hostType = "apps-sdk"): void {
  events = new EventTarget();
  openai = {
    theme: "light",
    locale: "en-US",
    view: { mode: "inline" },
    widgetState: null,
    callTool: vi.fn(),
    setWidgetState: vi.fn(async () => undefined),
    requestDisplayMode: vi.fn(async (args: { mode: string }) => args),
    requestClose: vi.fn(async () => undefined),
    sendFollowUpMessage: vi.fn(async () => undefined),
    openExternal: vi.fn(),
    requestModal: vi.fn(async () => undefined),
    uploadFile: vi.fn(),
    getFileDownloadUrl: vi.fn(async () => ({ downloadUrl: "https://x/f" })),
    setOpenInAppUrl: vi.fn(async () => undefined),
  };
  vi.stubGlobal("window", {
    mcpUi: { hostType },
    openai,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
}

beforeEach(() => {
  installHostMock();
  AppsSdkAdaptor.resetInstance();
  AppsSdkBridge.resetInstance();
});

afterEach(() => {
  AppsSdkAdaptor.resetInstance();
  AppsSdkBridge.resetInstance();
  vi.unstubAllGlobals();
});

describe("AppsSdkAdaptor.callTool", () => {
  it("normalizes a sparse host response (defaults + _meta → meta)", async () => {
    openai.callTool.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      structuredContent: undefined,
      isError: undefined,
      _meta: { trace: "abc" },
    });

    const result = await AppsSdkAdaptor.getInstance().callTool("echo", {
      msg: "hi",
    });

    expect(openai.callTool).toHaveBeenCalledWith("echo", { msg: "hi" });
    expect(result).toEqual({
      content: [{ type: "text", text: "hi" }],
      structuredContent: {},
      isError: false,
      meta: { trace: "abc" },
    });
  });

  it("prefers a present structuredContent/isError and `meta` fallback", async () => {
    openai.callTool.mockResolvedValue({
      content: [],
      structuredContent: { ok: true },
      isError: true,
      meta: { from: "meta" },
    });

    const result = await AppsSdkAdaptor.getInstance().callTool("t", null);

    expect(result.structuredContent).toEqual({ ok: true });
    expect(result.isError).toBe(true);
    expect(result.meta).toEqual({ from: "meta" });
  });
});

describe("AppsSdkAdaptor.getHostContextStore", () => {
  it("maps `viewState` onto widgetState.modelContent", () => {
    openai.widgetState = {
      modelContent: { count: 1 },
      privateContent: {},
    };
    const store = AppsSdkAdaptor.getInstance().getHostContextStore("viewState");
    expect(store.getSnapshot()).toEqual({ count: 1 });
  });

  it("returns null viewState when there is no widgetState", () => {
    const store = AppsSdkAdaptor.getInstance().getHostContextStore("viewState");
    expect(store.getSnapshot()).toBeNull();
  });

  it("maps `display` onto the host `view`", () => {
    const store = AppsSdkAdaptor.getInstance().getHostContextStore("display");
    expect(store.getSnapshot()).toEqual({ mode: "inline" });
  });

  it("reads same-named keys straight from window.openai (generic case)", () => {
    const store = AppsSdkAdaptor.getInstance().getHostContextStore("theme");
    expect(store.getSnapshot()).toBe("light");
  });

  it("notifies only on a relevant global change and stops after unsubscribe", () => {
    const store = AppsSdkAdaptor.getInstance().getHostContextStore("theme");
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(onChange);

    const fire = (globals: Record<string, unknown>) =>
      window.dispatchEvent(
        new CustomEvent(SET_GLOBALS_EVENT_TYPE, { detail: { globals } }),
      );

    fire({ locale: "fr-FR" });
    expect(onChange).not.toHaveBeenCalled();

    fire({ theme: "dark" });
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    fire({ theme: "light" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("AppsSdkAdaptor.setViewState", () => {
  it("writes a plain object as modelContent, preserving privateContent", () => {
    openai.widgetState = {
      modelContent: { old: true },
      privateContent: { secret: 1 },
    };
    AppsSdkAdaptor.getInstance().setViewState({ next: true });
    expect(openai.setWidgetState).toHaveBeenCalledWith({
      privateContent: { secret: 1 },
      modelContent: { next: true },
    });
  });

  it("passes the previous modelContent to an updater function", () => {
    openai.widgetState = {
      modelContent: { count: 1 },
      privateContent: {},
    };
    AppsSdkAdaptor.getInstance().setViewState((prev) => ({
      count: ((prev as { count: number })?.count ?? 0) + 1,
    }));
    expect(openai.setWidgetState).toHaveBeenCalledWith(
      expect.objectContaining({ modelContent: { count: 2 } }),
    );
  });
});

describe("AppsSdkAdaptor unsupported surfaces degrade gracefully", () => {
  it("requestSize warns and resolves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      AppsSdkAdaptor.getInstance().requestSize({ height: 100 }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("download reports an error result", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      AppsSdkAdaptor.getInstance().download({ contents: [] }),
    ).resolves.toEqual({ isError: true });
    expect(error).toHaveBeenCalled();
  });

  it("registerViewTool warns and returns a no-op disposer", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispose = AppsSdkAdaptor.getInstance().registerViewTool(
      { name: "noop" },
      async () => ({ content: [] }),
    );
    expect(typeof dispose).toBe("function");
    expect(() => dispose()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe("AppsSdkAdaptor.setOpenInAppUrl", () => {
  it("trims and forwards the href", async () => {
    await AppsSdkAdaptor.getInstance().setOpenInAppUrl("  https://x/app  ");
    expect(openai.setOpenInAppUrl).toHaveBeenCalledWith({
      href: "https://x/app",
    });
  });

  it("rejects a blank href", () => {
    expect(() => AppsSdkAdaptor.getInstance().setOpenInAppUrl("   ")).toThrow(
      /href parameter is required/,
    );
  });
});

describe("AppsSdkBridge guards", () => {
  it("throws when the host is not the apps-sdk runtime", () => {
    installHostMock("mcp-app");
    AppsSdkBridge.resetInstance();
    expect(() => AppsSdkBridge.getInstance()).toThrow(/apps-sdk runtime/);
  });
});
