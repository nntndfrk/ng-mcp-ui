import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { injectToolInfo } from "./inject-tool-info.js";
// Shared, non-shipping fakes (createFakeStore / createFakeAdaptor) — see
// test-fakes.ts. The host is provided purely via MCP_ADAPTOR (THE RULE), so
// the wrapper never touches getAdaptor()/window.
import { createFakeAdaptor, createFakeStore } from "./test-fakes.js";
import { MCP_ADAPTOR } from "./tokens.js";

function makeInjector(adaptor: Adaptor): EnvironmentInjector {
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectToolInfo", () => {
  it("returns idle state when toolInput is not set (mirrors mcp-app initial state)", () => {
    const adaptor = createFakeAdaptor();
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());

    expect(tool()).toMatchObject({
      status: "idle",
      isIdle: true,
      isPending: false,
      isSuccess: false,
      input: null,
      output: null,
      responseMetadata: null,
    });

    injector.destroy();
  });

  it("returns pending state with input once toolInput is pushed", () => {
    const toolInput = createFakeStore<"toolInput">(null);
    const adaptor = createFakeAdaptor({ stores: { toolInput: toolInput.store } });
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());
    expect(tool().status).toBe("idle");

    toolInput.push({ name: "pokemon", query: "pikachu" });

    expect(tool()).toMatchObject({
      status: "pending",
      isIdle: false,
      isPending: true,
      isSuccess: false,
      input: { name: "pokemon", query: "pikachu" },
    });

    injector.destroy();
  });

  it("returns success state once output + responseMetadata arrive", () => {
    const toolInput = createFakeStore<"toolInput">({
      name: "pokemon",
      query: "pikachu",
    });
    const toolOutput = createFakeStore<"toolOutput">(null);
    const toolResponseMetadata = createFakeStore<"toolResponseMetadata">(null);
    const adaptor = createFakeAdaptor({
      stores: {
        toolInput: toolInput.store,
        toolOutput: toolOutput.store,
        toolResponseMetadata: toolResponseMetadata.store,
      },
    });
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());
    // input present, no output/metadata yet → pending
    expect(tool().status).toBe("pending");

    toolOutput.push({ name: "pikachu", color: "yellow" });
    toolResponseMetadata.push({ requestId: "123" });

    expect(tool()).toMatchObject({
      status: "success",
      isIdle: false,
      isPending: false,
      isSuccess: true,
      input: { name: "pokemon", query: "pikachu" },
      output: { name: "pikachu", color: "yellow" },
      responseMetadata: { requestId: "123" },
    });

    injector.destroy();
  });

  it("transitions to success when only responseMetadata is present (output null)", () => {
    // deriveStatus: success requires NOT (output===null && metadata===null).
    const toolInput = createFakeStore<"toolInput">({ q: 1 });
    const toolResponseMetadata = createFakeStore<"toolResponseMetadata">(null);
    const adaptor = createFakeAdaptor({
      stores: {
        toolInput: toolInput.store,
        toolResponseMetadata: toolResponseMetadata.store,
      },
    });
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());
    expect(tool().status).toBe("pending");

    toolResponseMetadata.push({ id: 9 });
    expect(tool().status).toBe("success");

    injector.destroy();
  });

  it("resolves the adaptor from MCP_ADAPTOR (no getAdaptor / no window)", () => {
    // A fake provided purely via the token: if injectToolInfo secretly called
    // getAdaptor() it would touch window.mcpUi (unset here) and throw.
    const toolInput = createFakeStore<"toolInput">({ q: "x" });
    const adaptor = createFakeAdaptor({ stores: { toolInput: toolInput.store } });
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());
    expect(tool().status).toBe("pending");

    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectToolInfo()).toThrow();
  });

  it("stops reacting to host pushes after the injector is destroyed", () => {
    const toolInput = createFakeStore<"toolInput">(null);
    const adaptor = createFakeAdaptor({ stores: { toolInput: toolInput.store } });
    const injector = makeInjector(adaptor);

    const tool = runInInjectionContext(injector, () => injectToolInfo());
    injector.destroy();

    toolInput.push({ late: true });
    // computed re-reads the signal, but the underlying subscription was torn
    // down, so the signal never updated → still idle.
    expect(tool().status).toBe("idle");
  });
});

// Compile-time type assertions live in inject-tool-info.test-d.ts (validated by
// `npm run test:types`), per the repo convention — never as no-op runtime tests.
