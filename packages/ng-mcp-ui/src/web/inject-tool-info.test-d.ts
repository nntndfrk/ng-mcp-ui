import { describe, expectTypeOf, it } from "vitest";
import { type ToolState, injectToolInfo } from "./inject-tool-info.js";

// Compile-time type assertions for injectToolInfo. This file is never executed
// (vitest collects it only under `--typecheck.only`); the `injectToolInfo()`
// calls are type-checked, not run, so the missing injection context is moot.
// Ported from use-tool-info.test-d.ts.

describe("injectToolInfo — TypeScript typing", () => {
  it("has correct types when no generic parameter is provided", () => {
    const tool = injectToolInfo();
    const result = tool();

    expectTypeOf(result.status).toEqualTypeOf<"idle" | "pending" | "success">();
    expectTypeOf(result.isPending).toEqualTypeOf<boolean>();
    expectTypeOf(result.isSuccess).toEqualTypeOf<boolean>();
    expectTypeOf(result.isIdle).toEqualTypeOf<boolean>();
    // With no generic, the typed fields collapse to `never` (the default
    // `TS = Record<string, never>` ⇒ `TS["input"]` is `never`), so the only
    // value `result.input` can hold across the union is `undefined`. This asserts
    // assignability: `undefined` is assignable to `Record<string,unknown> | undefined`.
    expectTypeOf(result.input).toMatchTypeOf<
      Record<string, unknown> | undefined
    >();
  });

  it("narrows input/output/responseMetadata with an explicit ToolSignature", () => {
    type TestInput = { name: string; args: { name: string } };
    type TestOutput = { name: string; color: string };
    type TestMetadata = { id: number };

    const tool = injectToolInfo<{
      input: TestInput;
      output: TestOutput;
      responseMetadata: TestMetadata;
    }>();
    const result = tool();

    if (result.status === "idle") {
      expectTypeOf(result.input).toEqualTypeOf<undefined>();
      expectTypeOf(result.output).toEqualTypeOf<undefined>();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<undefined>();
    }
    if (result.status === "pending") {
      expectTypeOf(result.input).toEqualTypeOf<
        Record<string, unknown> & TestInput
      >();
      expectTypeOf(result.output).toEqualTypeOf<undefined>();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<undefined>();
    }
    if (result.status === "success") {
      expectTypeOf(result.input).toEqualTypeOf<
        Record<string, unknown> & TestInput
      >();
      expectTypeOf(result.output).toEqualTypeOf<
        Record<string, unknown> & TestOutput
      >();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<
        Record<string, unknown> & TestMetadata
      >();
    }
  });

  it("narrows via the boolean discriminants", () => {
    const tool = injectToolInfo<{
      input: { query: string };
      output: { result: string };
    }>();
    const result = tool();

    if (result.isIdle) {
      expectTypeOf(result.status).toEqualTypeOf<"idle">();
      expectTypeOf(result.isPending).toEqualTypeOf<false>();
      expectTypeOf(result.isSuccess).toEqualTypeOf<false>();
    }
    if (result.isPending) {
      expectTypeOf(result.status).toEqualTypeOf<"pending">();
      expectTypeOf(result.isIdle).toEqualTypeOf<false>();
      expectTypeOf(result.isSuccess).toEqualTypeOf<false>();
    }
    if (result.isSuccess) {
      expectTypeOf(result.status).toEqualTypeOf<"success">();
      expectTypeOf(result.isIdle).toEqualTypeOf<false>();
      expectTypeOf(result.isPending).toEqualTypeOf<false>();
    }
  });

  it("ToolState is exported and usable directly", () => {
    type S = ToolState<{ a: number }, { b: string }, { c: boolean }>;
    const state = {} as S;
    if (state.status === "success") {
      expectTypeOf(state.output.b).toBeString();
      expectTypeOf(state.responseMetadata.c).toBeBoolean();
    }
  });
});
