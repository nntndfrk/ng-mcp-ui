import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { type Mock, describe, expect, it, vi } from "vitest";
import type { Adaptor, CallToolResponse } from "./bridges/types.js";
import { injectCallTool } from "./inject-call-tool.js";
// Shared, non-shipping fakes — see test-fakes.ts. Only `callTool` is exercised
// here (injectCallTool never reads the host-context store); the default
// getHostContextStore stub is harmless. The rest throw if accidentally touched.
import { createFakeAdaptor } from "./test-fakes.js";
import { MCP_ADAPTOR } from "./tokens.js";

function makeInjector(callTool: Mock): EnvironmentInjector {
  const adaptor = createFakeAdaptor({
    methods: { callTool: callTool as unknown as Adaptor["callTool"] },
  });
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

const toolName = "test-tool";
const args = { input: "test input" };
const data: CallToolResponse = {
  content: [{ type: "text" as const, text: "test result" }],
  structuredContent: { result: "test" },
  isError: false,
  meta: {},
};
const error = new Error("test error");

// Flush microtasks so the internal `execute` promise chain settles.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("injectCallTool — behavior", () => {
  it("calls adaptor.callTool with the tool name and args", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    tool.callTool(args);
    await flush();

    expect(callTool).toHaveBeenCalledWith(toolName, args);
    injector.destroy();
  });

  it("moves status idle → pending → success and exposes data", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    expect(tool.status()).toBe("idle");
    expect(tool.data()).toBeUndefined();

    const promise = tool.callToolAsync(args);
    expect(tool.status()).toBe("pending");

    await promise;
    expect(tool.status()).toBe("success");
    expect(tool.data()).toEqual(data);
    expect(tool.error()).toBeUndefined();

    injector.destroy();
  });

  it("tracks error state when the call rejects", async () => {
    const callTool = vi.fn().mockRejectedValueOnce(error);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    await expect(tool.callToolAsync(args)).rejects.toThrow("test error");
    expect(tool.status()).toBe("error");
    expect(tool.data()).toBeUndefined();
    expect(tool.error()).toBe(error);

    injector.destroy();
  });

  it("fires onSuccess + onSettled (not onError) on success", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    tool.callTool(args, { onSuccess, onError, onSettled });
    await flush();

    expect(onSuccess).toHaveBeenCalledWith(data, args);
    expect(onSettled).toHaveBeenCalledWith(data, undefined, args);
    expect(onError).not.toHaveBeenCalled();

    injector.destroy();
  });

  it("fires onError + onSettled (not onSuccess) on failure", async () => {
    const callTool = vi.fn().mockRejectedValueOnce(error);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    tool.callTool(args, { onSuccess, onError, onSettled });
    await flush();

    expect(onError).toHaveBeenCalledWith(error, args);
    expect(onSettled).toHaveBeenCalledWith(undefined, error, args);
    expect(onSuccess).not.toHaveBeenCalled();

    injector.destroy();
  });

  it("treats a leading SideEffects object as no-args (passes null)", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const onSuccess = vi.fn();
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<null, typeof data>(toolName),
    );

    tool.callTool({ onSuccess });
    await flush();

    expect(callTool).toHaveBeenCalledWith(toolName, null);
    expect(onSuccess).toHaveBeenCalledWith(data, null);

    injector.destroy();
  });

  it("treats an args object that merely contains an onSuccess key as ARGS, not SideEffects", async () => {
    // Disambiguation guard: only an object whose keys are ALL callbacks is read
    // as SideEffects. A real args object that happens to carry an `onSuccess`
    // data field (a valid CallToolArgs key) alongside other keys must be passed
    // through as args, not silently dropped to null.
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<{ query: string; onSuccess: string }, typeof data>(
        toolName,
      ),
    );

    const realArgs = { query: "pikachu", onSuccess: "not-a-callback" };
    tool.callTool(realArgs);
    await flush();

    expect(callTool).toHaveBeenCalledWith(toolName, realArgs);

    injector.destroy();
  });

  it("callToolAsync() with no args passes null to the adaptor", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<null, typeof data>(toolName),
    );

    await tool.callToolAsync();
    expect(callTool).toHaveBeenCalledWith(toolName, null);

    injector.destroy();
  });

  it("keeps only the last-started call's result (drops superseded response)", async () => {
    const firstCallData = {
      ...data,
      structuredContent: { result: "first call result" },
    };
    const secondCallData = {
      ...data,
      structuredContent: { result: "second call result" },
    };
    // Manual resolvers (avoids Promise.withResolvers — lib target is ES2022).
    let resolveFirst!: (v: CallToolResponse) => void;
    let resolveSecond!: (v: CallToolResponse) => void;
    const firstPromise = new Promise<CallToolResponse>((r) => {
      resolveFirst = r;
    });
    const secondPromise = new Promise<CallToolResponse>((r) => {
      resolveSecond = r;
    });

    const callTool = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => secondPromise);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );

    tool.callTool(args); // call 1
    tool.callTool(args); // call 2 (supersedes 1)

    // Resolve the FIRST (now-stale) call — its write must be ignored.
    resolveFirst(firstCallData);
    await firstPromise;
    expect(tool.status()).toBe("pending");
    expect(tool.data()).toBeUndefined();

    resolveSecond(secondCallData);
    await flush();
    expect(tool.status()).toBe("success");
    expect(tool.data()).toEqual(secondCallData);

    injector.destroy();
  });

  it("resolves the adaptor from MCP_ADAPTOR (no getAdaptor / no window)", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(data);
    const injector = makeInjector(callTool);

    const tool = runInInjectionContext(injector, () =>
      injectCallTool<typeof args, typeof data>(toolName),
    );
    await tool.callToolAsync(args);
    expect(callTool).toHaveBeenCalledWith(toolName, args);

    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectCallTool("x")).toThrow();
  });
});

// Compile-time type assertions live in inject-call-tool.test-d.ts (validated by
// `npm run test:types`), per the repo convention — never as no-op runtime tests.
