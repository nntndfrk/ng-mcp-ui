import {
  type EnvironmentInjector,
  Injector,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import { injectCallTool } from "../web/inject-call-tool.js";
import { injectToolInfo } from "../web/inject-tool-info.js";
import { MCP_ADAPTOR, MCP_SERVER_URL } from "../web/tokens.js";
import { MockAdaptor, type MockMcpUiArgs } from "./mock-adaptor.js";
import { provideMockMcpUi } from "./provide-mock-mcp-ui.js";

// `provideMockMcpUi` returns `makeEnvironmentProviders(...)`, so it resolves
// through an EnvironmentInjector — not a plain `Injector.create`. We follow the
// same no-TestBed pattern as web/provide-mcp-ui.test.ts: build an
// EnvironmentInjector from the providers over a bare `Injector.create` parent,
// then resolve tokens / run inject* wrappers via `runInInjectionContext`. The
// draft used TestBed + platformBrowserTesting; this package deliberately avoids
// TestBed (no zone, no JIT, no DOM stub needed for provider resolution).
function injectorFrom(args: MockMcpUiArgs = {}): {
  injector: EnvironmentInjector;
  adaptor: MockAdaptor;
} {
  const { providers, adaptor } = provideMockMcpUi(args);
  const parent = Injector.create({ providers: [] }) as EnvironmentInjector;
  const injector = createEnvironmentInjector([providers], parent);
  return { injector, adaptor: adaptor as MockAdaptor };
}

describe("provideMockMcpUi", () => {
  it("binds MCP_ADAPTOR to a MockAdaptor and MCP_SERVER_URL to the supplied value", () => {
    const { injector, adaptor } = injectorFrom({
      serverUrl: "https://mock.example",
    });

    expect(injector.get(MCP_ADAPTOR)).toBe(adaptor);
    expect(injector.get(MCP_ADAPTOR)).toBeInstanceOf(MockAdaptor);
    expect(injector.get(MCP_SERVER_URL)).toBe("https://mock.example");
    injector.destroy();
  });

  it("defaults MCP_SERVER_URL to an empty string", () => {
    const { injector } = injectorFrom();
    expect(injector.get(MCP_SERVER_URL)).toBe("");
    injector.destroy();
  });

  it("drives injectToolInfo end-to-end: a host-context push flips the signal", () => {
    const { injector, adaptor } = injectorFrom();

    const tool = runInInjectionContext(injector, () =>
      injectToolInfo<{ input: { query: string }; output: { count: number } }>(),
    );

    // Seeded default: no toolInput → idle.
    expect(tool().status).toBe("idle");
    expect(tool().isIdle).toBe(true);

    // Host pushes the input → pending (input present, no output yet).
    adaptor.pushHostContext("toolInput", { query: "angular" });
    const pending = tool();
    expect(pending.status).toBe("pending");
    expect(pending.input).toEqual({ query: "angular" });

    // Host pushes the output → success.
    adaptor.pushHostContext("toolOutput", { count: 3 });
    const success = tool();
    expect(success.status).toBe("success");
    expect(success.isSuccess).toBe(true);
    if (success.isSuccess) {
      expect(success.output).toEqual({ count: 3 });
    }
    injector.destroy();
  });

  it("drives injectCallTool end-to-end: a canned toolResponses entry resolves through callTool", async () => {
    const { injector, adaptor } = injectorFrom({
      toolResponses: {
        search: { results: ["a", "b"] },
      },
    });

    const { callToolAsync, status, data } = runInInjectionContext(injector, () =>
      injectCallTool<{ q: string }>("search"),
    );

    expect(status()).toBe("idle");

    const response = await callToolAsync({ q: "ng" });

    expect(status()).toBe("success");
    expect(response.structuredContent).toEqual({ results: ["a", "b"] });
    expect(response.isError).toBe(false);
    expect(data()?.structuredContent).toEqual({ results: ["a", "b"] });

    // The call was recorded with the tool name and args.
    expect(adaptor.calls).toContainEqual({
      method: "callTool",
      args: ["search", { q: "ng" }],
    });
    injector.destroy();
  });

  it("callTool resolves an empty success for an unlisted tool name", async () => {
    const { injector } = injectorFrom();

    const { callToolAsync } = runInInjectionContext(injector, () =>
      injectCallTool("unknown"),
    );
    const response = await callToolAsync();

    expect(response.structuredContent).toEqual({});
    expect(response.isError).toBe(false);
    injector.destroy();
  });

  it("accepts a full CallToolResponse as a canned response (content/isError preserved)", async () => {
    const { injector } = injectorFrom({
      toolResponses: {
        failing: {
          content: [{ type: "text", text: "boom" }],
          structuredContent: { ok: false },
          isError: true,
        },
      },
    });

    const { callToolAsync } = runInInjectionContext(injector, () =>
      injectCallTool("failing"),
    );
    const response = await callToolAsync();

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([{ type: "text", text: "boom" }]);
    expect(response.structuredContent).toEqual({ ok: false });
    injector.destroy();
  });
});
