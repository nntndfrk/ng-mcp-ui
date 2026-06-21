import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { McpAppAdaptor } from "./adaptor.js";
import { McpAppBridge } from "./bridge.js";

// Framework-free tests for the mcp-app view-tools surface. There is no DOM
// environment (vitest runs under node), so we simulate the minimal browser
// surface the `ext-apps` `App` transport needs — `window`, `document`,
// `requestAnimationFrame`, and `ResizeObserver` — via `globalThis`, and `await`
// the message round-trips directly.

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
};

/**
 * Minimal stand-in for a `MessageEvent`. Node's native `MessageEvent` rejects a
 * non-`MessagePort` `source`, but the transport only reads `.data` and `.source`,
 * so a plain `Event` subclass with those fields is sufficient.
 */
class FakeMessageEvent extends Event {
  readonly data: unknown;
  readonly source: unknown;
  constructor(data: unknown, source: unknown) {
    super("message");
    this.data = data;
    this.source = source;
  }
}

const outgoing: JsonRpcMessage[] = [];
// Recreated per test in installHostMock() so a leaked `message` listener from a
// prior test's ext-apps App (resetInstance() clears the bridge map but does not
// tear the transport down) can't fire on this test's dispatches.
let eventTarget = new EventTarget();

interface FakeWindow {
  addEventListener: EventTarget["addEventListener"];
  removeEventListener: EventTarget["removeEventListener"];
  dispatchEvent: EventTarget["dispatchEvent"];
  innerWidth: number;
  parent: { postMessage: (message: JsonRpcMessage) => void };
  mcpUi?: { hostType: string };
  [key: string]: unknown;
}

let fakeWindow: FakeWindow;

/**
 * Install a fake window that records every message posted to `window.parent`
 * and auto-replies to the `ui/initialize` handshake, mirroring the original
 * host mock.
 */
function installHostMock() {
  outgoing.length = 0;
  eventTarget = new EventTarget();
  const parent = {
    postMessage: (message: JsonRpcMessage) => {
      outgoing.push(message);
      if (message.method === "ui/initialize" && message.id !== undefined) {
        eventTarget.dispatchEvent(
          new FakeMessageEvent(
            {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: "2025-06-18",
                hostInfo: { name: "test-host", version: "1.0.0" },
                hostCapabilities: {},
                hostContext: {},
              },
            },
            parent,
          ),
        );
      }
    },
  };

  fakeWindow = {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    innerWidth: 0,
    parent,
    mcpUi: { hostType: "mcp-app" },
  };

  // The transport reads `window.parent` at construction and posts/listens via
  // these. Assigning to globalThis makes the bare `window` references in the
  // bridge and transport resolve.
  vi.stubGlobal("window", fakeWindow);

  // `App` (with default autoResize) calls `setupSizeChangedNotifications`, which
  // touches these browser APIs on connect. Stub them as no-ops.
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

let nextId = 1000;

/** Send a host → app JSON-RPC request and resolve with the full response (result or error). */
async function callHost(
  method: string,
  params: Record<string, unknown> = {},
): Promise<JsonRpcMessage | undefined> {
  const id = ++nextId;
  eventTarget.dispatchEvent(
    new FakeMessageEvent(
      { jsonrpc: "2.0", id, method, params },
      fakeWindow.parent,
    ),
  );
  await vi.waitFor(() => {
    expect(outgoing.some((m) => m.id === id)).toBe(true);
  });
  return outgoing.find((m) => m.id === id);
}

describe("McpApp view tools", () => {
  beforeEach(() => {
    McpAppBridge.resetInstance();
    McpAppAdaptor.resetInstance();
    installHostMock();
    // Silence ext-apps' verbose transport logging in tests.
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("advertises the tools capability during ui/initialize", async () => {
    await McpAppBridge.getInstance().getApp();
    const init = outgoing.find((m) => m.method === "ui/initialize");
    expect(init?.params?.appCapabilities).toMatchObject({
      tools: { listChanged: true },
    });
  });

  it("lists a registered view tool with its input schema", async () => {
    const adaptor = McpAppAdaptor.getInstance();
    await McpAppBridge.getInstance().getApp();

    adaptor.registerViewTool(
      {
        name: "chess_make_move",
        description: "Play a move",
        inputSchema: { san: z.string() },
        annotations: { readOnlyHint: false },
      },
      () => ({ content: [{ type: "text", text: "ok" }] }),
    );

    const response = await callHost("tools/list");
    const tools = response?.result?.tools as Array<{
      name: string;
      description?: string;
      inputSchema: { properties?: Record<string, unknown> };
      annotations?: { readOnlyHint?: boolean };
    }>;
    expect(tools).toHaveLength(1);
    const [tool] = tools;
    expect(tool?.name).toBe("chess_make_move");
    expect(tool?.description).toBe("Play a move");
    expect(tool?.inputSchema.properties).toHaveProperty("san");
    expect(tool?.annotations?.readOnlyHint).toBe(false);
  });

  it("invokes the handler with validated args and returns its result", async () => {
    const adaptor = McpAppAdaptor.getInstance();
    await McpAppBridge.getInstance().getApp();

    const handler = vi.fn(({ san }: { san: string }) => ({
      content: [{ type: "text" as const, text: `played ${san}` }],
      structuredContent: { lastMove: san },
    }));

    adaptor.registerViewTool(
      { name: "chess_make_move", inputSchema: { san: z.string() } },
      handler as never,
    );

    const response = await callHost("tools/call", {
      name: "chess_make_move",
      arguments: { san: "e4" },
    });
    const result = response?.result;

    // ext-apps invokes the callback as `(args, extra)`; assert on the args only.
    expect(handler.mock.calls[0]?.[0]).toEqual({ san: "e4" });
    expect(result?.structuredContent).toEqual({ lastMove: "e4" });
    expect(result?.isError).toBeFalsy();
    expect(result?.content).toEqual([{ type: "text", text: "played e4" }]);
  });

  it("rejects the call without invoking the handler when args are invalid", async () => {
    const adaptor = McpAppAdaptor.getInstance();
    await McpAppBridge.getInstance().getApp();

    const handler = vi.fn(() => ({ content: [] }));
    adaptor.registerViewTool(
      { name: "chess_make_move", inputSchema: { san: z.string() } },
      handler as never,
    );

    // ext-apps validates input against the schema and rejects with a JSON-RPC
    // error before the handler runs.
    const response = await callHost("tools/call", {
      name: "chess_make_move",
      arguments: { san: 42 },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(response?.error).toBeDefined();
  });

  it("rejects a call to an unknown tool", async () => {
    await McpAppBridge.getInstance().getApp();
    const response = await callHost("tools/call", {
      name: "nope",
      arguments: {},
    });
    expect(response?.error).toBeDefined();
  });

  it("removes the tool and notifies the host when unregistered", async () => {
    const adaptor = McpAppAdaptor.getInstance();
    await McpAppBridge.getInstance().getApp();

    const unregister = adaptor.registerViewTool({ name: "chess_reset" }, () => ({
      content: [{ type: "text", text: "reset" }],
    }));

    await vi.waitFor(() => {
      expect(
        outgoing.some((m) => m.method === "notifications/tools/list_changed"),
      ).toBe(true);
    });

    let listed = await callHost("tools/list");
    expect(listed?.result?.tools).toHaveLength(1);

    unregister();
    listed = await callHost("tools/list");
    expect(listed?.result?.tools).toHaveLength(0);
  });
});
