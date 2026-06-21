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
    // With no generic, `TS` defaults to `ToolSignature`, so each typed field is
    // `Record<string, unknown>`. Across the union `result.input` is that (pending
    // /success) or `null` (idle) — matching the host-context runtime values.
    expectTypeOf(result.input).toEqualTypeOf<Record<string, unknown> | null>();
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
      expectTypeOf(result.input).toEqualTypeOf<null>();
      expectTypeOf(result.output).toEqualTypeOf<null>();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<null>();
    }
    if (result.status === "pending") {
      expectTypeOf(result.input).toEqualTypeOf<
        Record<string, unknown> & TestInput
      >();
      expectTypeOf(result.output).toEqualTypeOf<null>();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<null>();
    }
    if (result.status === "success") {
      expectTypeOf(result.input).toEqualTypeOf<
        Record<string, unknown> & TestInput
      >();
      // output / responseMetadata are nullable in success: deriveStatus reaches
      // success as soon as either arrives, so the other may still be null.
      expectTypeOf(result.output).toEqualTypeOf<
        (Record<string, unknown> & TestOutput) | null
      >();
      expectTypeOf(result.responseMetadata).toEqualTypeOf<
        (Record<string, unknown> & TestMetadata) | null
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
      // output / responseMetadata are nullable in success — narrow before use.
      if (state.output) {
        expectTypeOf(state.output.b).toBeString();
      }
      if (state.responseMetadata) {
        expectTypeOf(state.responseMetadata.c).toBeBoolean();
      }
    }
  });
});
