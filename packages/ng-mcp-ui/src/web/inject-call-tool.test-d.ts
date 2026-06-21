import { describe, expectTypeOf, it } from "vitest";
import type { CallToolResponse } from "./bridges/types.js";
import {
  type CallToolState,
  type SideEffects,
  injectCallTool,
} from "./inject-call-tool.js";

// Compile-time type assertions for injectCallTool. This file is never executed
// (vitest collects it only under `--typecheck.only`); the `injectCallTool()`
// calls are type-checked, not run, so the missing injection context is moot.
// Ported from use-call-tool.test-d.ts + the .test.ts typing block.

const toolName = "test-tool";

describe("injectCallTool — TypeScript typing", () => {
  it("callTool/callToolAsync are arg-optional when ToolArgs is null", () => {
    const tool = injectCallTool<null>(toolName);

    tool.callTool();
    tool.callTool({ onSuccess: () => {} });
    void tool.callToolAsync();
  });

  it("callTool requires args when ToolArgs has required keys", () => {
    type Args = { query: string };
    const tool = injectCallTool<Args>(toolName);

    // @ts-expect-error - query is required
    tool.callTool();
    tool.callTool({ query: "test" });
    tool.callTool({ query: "test" }, { onSuccess: () => {} });

    // @ts-expect-error - query is required
    void tool.callToolAsync();
    void tool.callToolAsync({ query: "test" });
  });

  it("sideEffects callbacks are correctly typed", () => {
    type Args = { id: number };
    type Response = { structuredContent: { result: string } };
    const tool = injectCallTool<Args, Response>(toolName);

    tool.callTool(
      { id: 1 },
      {
        onSuccess: (d, a) => {
          expectTypeOf(d.structuredContent.result).toBeString();
          expectTypeOf(a.id).toBeNumber();
        },
        onError: (e, a) => {
          expectTypeOf(e).toBeUnknown();
          expectTypeOf(a.id).toBeNumber();
        },
        onSettled: (d, e, a) => {
          if (d) {
            expectTypeOf(d.structuredContent.result).toBeString();
          }
          expectTypeOf(e).toEqualTypeOf<unknown | undefined>();
          expectTypeOf(a.id).toBeNumber();
        },
      },
    );
  });

  it("callToolAsync returns a correctly typed promise", () => {
    type Args = { name: string };
    type Response = {
      structuredContent: { greeting: string };
      meta: { id: number };
    };
    const tool = injectCallTool<Args, Response>(toolName);

    const promise = tool.callToolAsync({ name: "test" });
    expectTypeOf(promise).resolves.toHaveProperty("structuredContent");
    expectTypeOf(promise).resolves.toHaveProperty("meta");
  });

  it("data signal narrows on status", () => {
    type Response = { structuredContent: { data: string } };
    const tool = injectCallTool<null, Response>(toolName);

    // data() is the full union member; the discriminated narrowing lives on the
    // CallToolState type (asserted below). Here verify the data element type.
    expectTypeOf(tool.data()).toEqualTypeOf<
      (CallToolResponse & Response) | undefined
    >();
    expectTypeOf(tool.status()).toEqualTypeOf<
      "idle" | "pending" | "success" | "error"
    >();
  });

  it("CallToolState type is exported and narrows on status", () => {
    type Response = { structuredContent: { foo: string } };
    type MyState = CallToolState<CallToolResponse & Response>;
    const state = {} as MyState;
    if (state.status === "success") {
      expectTypeOf(state.data.structuredContent.foo).toBeString();
    }
    if (state.status === "error") {
      expectTypeOf(state.error).toBeUnknown();
    }
  });

  it("SideEffects type is exported and usable", () => {
    type Args = { x: number };
    type Response = CallToolResponse & { structuredContent: { y: string } };
    const sideEffects: SideEffects<Args, Response> = {
      onSuccess: (d, a) => {
        expectTypeOf(d.structuredContent.y).toBeString();
        expectTypeOf(a.x).toBeNumber();
      },
    };
    expectTypeOf(sideEffects).toHaveProperty("onSuccess");
  });
});
