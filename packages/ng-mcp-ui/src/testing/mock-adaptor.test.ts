import { beforeEach, describe, expect, it } from "vitest";
import type { Adaptor, AnyViewToolHandler } from "../web/bridges/types.js";
import { createHostContextSignals } from "../web/host-context.js";
import { MockAdaptor } from "./mock-adaptor.js";

// The MockAdaptor is a plain in-memory object — no Angular DI, no TestBed. These
// tests exercise its three behaviours (store-backed host context, toolResponses,
// log-and-resolve) directly. The DI-facing end-to-end coverage (provideMockMcpUi
// driving the inject* wrappers) lives in provide-mock-mcp-ui.test.ts.
describe("MockAdaptor", () => {
  let adaptor: MockAdaptor;

  beforeEach(() => {
    adaptor = new MockAdaptor();
  });

  it("seeds every host-context key from defaults, overridden by args.hostContext", () => {
    const custom = new MockAdaptor({
      hostContext: { theme: "dark", locale: "fr-FR" },
    });
    expect(custom.getHostContextStore("theme").getSnapshot()).toBe("dark");
    expect(custom.getHostContextStore("locale").getSnapshot()).toBe("fr-FR");
    // Unset key falls back to the default.
    expect(custom.getHostContextStore("displayMode").getSnapshot()).toBe(
      "inline",
    );
  });

  it("pushHostContext notifies the matching store's subscribers", () => {
    const store = adaptor.getHostContextStore("theme");
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    adaptor.pushHostContext("theme", "dark");
    expect(notified).toBe(1);
    expect(store.getSnapshot()).toBe("dark");

    unsubscribe();
    adaptor.pushHostContext("theme", "light");
    expect(notified).toBe(1); // no longer subscribed
  });

  it("log-and-resolve methods record and resolve sensible defaults", async () => {
    expect(await adaptor.requestDisplayMode("fullscreen")).toEqual({
      mode: "fullscreen",
    });
    await adaptor.requestClose();
    await adaptor.requestSize({ width: 10 });
    await adaptor.sendFollowUpMessage("hi", { scrollToBottom: true });
    adaptor.openExternal("https://x.test");
    expect(await adaptor.download({ contents: [] })).toEqual({
      isError: false,
    });
    const file = new File(["x"], "a.txt");
    expect(await adaptor.uploadFile(file)).toEqual({
      fileId: "mock-file-a.txt",
      fileName: "a.txt",
    });
    expect(await adaptor.getFileDownloadUrl({ fileId: "f1" })).toEqual({
      downloadUrl: "mock://download/f1",
    });
    expect(await adaptor.selectFiles()).toEqual([]);
    await adaptor.setOpenInAppUrl("https://app.test");

    expect(adaptor.calls.map((c) => c.method)).toEqual([
      "requestDisplayMode",
      "requestClose",
      "requestSize",
      "sendFollowUpMessage",
      "openExternal",
      "download",
      "uploadFile",
      "getFileDownloadUrl",
      "selectFiles",
      "setOpenInAppUrl",
    ]);
  });

  it("setViewState updates the in-memory state and the viewState store", async () => {
    const store = adaptor.getHostContextStore("viewState");
    await adaptor.setViewState({ count: 1 });
    expect(store.getSnapshot()).toEqual({ count: 1 });

    // Functional updater receives the previous state.
    await adaptor.setViewState((prev) => ({
      count: ((prev?.count as number) ?? 0) + 1,
    }));
    expect(store.getSnapshot()).toEqual({ count: 2 });
  });

  it("setViewState's functional updater sees a prior pushHostContext('viewState')", () => {
    // The store is the single source of truth: a host push of viewState must be
    // visible to a later functional setViewState updater (no stale cache).
    const store = adaptor.getHostContextStore("viewState");
    adaptor.pushHostContext("viewState", { count: 41 });

    adaptor.setViewState((prev) => ({ count: ((prev?.count as number) ?? 0) + 1 }));
    expect(store.getSnapshot()).toEqual({ count: 42 });
  });

  it("openModal reflects on the display store", () => {
    const store = adaptor.getHostContextStore("display");
    adaptor.openModal({ title: "t", params: { a: 1 } });
    expect(store.getSnapshot()).toEqual({ mode: "modal", params: { a: 1 } });
  });

  it("registerViewTool records the registration and returns a recording teardown", () => {
    const handler: AnyViewToolHandler = async () => ({ content: [] });
    const dispose = adaptor.registerViewTool({ name: "view_tool" }, handler);
    dispose();

    expect(adaptor.calls.map((c) => c.method)).toEqual([
      "registerViewTool",
      "registerViewTool:dispose",
    ]);
  });

  it("clearCalls empties the call log", () => {
    adaptor.openExternal("https://x.test");
    expect(adaptor.calls).toHaveLength(1);
    adaptor.clearCalls();
    expect(adaptor.calls).toHaveLength(0);
  });

  it("satisfies createHostContextSignals (the real signal-store consumer)", () => {
    // Proves the mock's stores honour the HostContextStore contract end-to-end:
    // createHostContextSignals seeds + subscribes against them.
    const signals = createHostContextSignals(adaptor as Adaptor);
    expect(signals.theme()).toBe("light");
    adaptor.pushHostContext("theme", "dark");
    expect(signals.theme()).toBe("dark");
    signals.destroy();
  });
});
