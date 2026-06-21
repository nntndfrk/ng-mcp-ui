import { describe, expectTypeOf, it } from "vitest";
import type {
  InferTools,
  ToolInput,
  ToolNames,
  ToolOutput,
  ToolResponseMetadata,
} from "./inferUtilityTypes.js";
import type { McpServerTypes, ToolDef } from "./types.js";

// Compile-time type tests. Run ONLY by `npm run test:types`
// (`vitest run --typecheck.only`), never by the runtime `npm test`. A stand-in
// for an McpServer instance: only the structural `$types` marker matters for
// inference (cross-package structural typing — see the InferTools docs).
type Tools = {
  search: ToolDef<{ query: string }, { hits: number }, { tookMs: number }>;
  ping: ToolDef<{ n: number }, { ok: boolean }, undefined>;
};
type FakeServer = { $types: McpServerTypes<Tools> };

describe("inferUtilityTypes", () => {
  it("InferTools extracts the structural tool registry", () => {
    expectTypeOf<InferTools<FakeServer>>().toEqualTypeOf<Tools>();
  });

  it("InferTools yields never without a `$types` marker", () => {
    expectTypeOf<InferTools<{ notTypes: true }>>().toBeNever();
  });

  it("ToolNames unions the registered tool names", () => {
    expectTypeOf<ToolNames<FakeServer>>().toEqualTypeOf<"search" | "ping">();
  });

  it("ToolInput narrows by tool name", () => {
    expectTypeOf<ToolInput<FakeServer, "search">>().toEqualTypeOf<{
      query: string;
    }>();
    expectTypeOf<ToolInput<FakeServer, "ping">>().toEqualTypeOf<{ n: number }>();
  });

  it("ToolOutput narrows by tool name", () => {
    expectTypeOf<ToolOutput<FakeServer, "search">>().toEqualTypeOf<{
      hits: number;
    }>();
  });

  it("ToolResponseMetadata narrows by tool name", () => {
    expectTypeOf<ToolResponseMetadata<FakeServer, "search">>().toEqualTypeOf<{
      tookMs: number;
    }>();
  });
});
