import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type {
  ClientHintsMeta,
  ExtendToolRegistry,
  ExtractMeta,
  ExtractStructuredContent,
  InferToolArgs,
  McpToolContext,
  ToolConfig,
  ToolHandler,
} from "./tool-types.js";
import type { ToolDef } from "./types.js";

// Compile-time type tests. Run ONLY by `npm run test:types`
// (`vitest run --typecheck.only`), never by the runtime `npm test`.

const schema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});
type Schema = typeof schema;

describe("InferToolArgs", () => {
  it("keeps required fields required and makes optional fields optional", () => {
    expectTypeOf<InferToolArgs<Schema>>().toEqualTypeOf<{
      query: string;
      limit?: number | undefined;
    }>();
  });

  it("a schema-less tool yields an empty args object", () => {
    expectTypeOf<InferToolArgs<undefined>>().toEqualTypeOf<
      Record<never, never>
    >();
  });
});

describe("ExtractStructuredContent", () => {
  it("pulls the structuredContent shape", () => {
    expectTypeOf<
      ExtractStructuredContent<{ structuredContent: { hits: number } }>
    >().toEqualTypeOf<{ hits: number }>();
  });

  it("is never when the return has no structuredContent", () => {
    expectTypeOf<ExtractStructuredContent<{ content: string }>>().toBeNever();
  });

  it("pulls the shape from an optional structuredContent? (undefined stripped)", () => {
    expectTypeOf<
      ExtractStructuredContent<{
        content: string;
        structuredContent?: { hits: number };
      }>
    >().toEqualTypeOf<{ hits: number }>();
  });

  it("pulls the shape from the carrying member of a union return", () => {
    expectTypeOf<
      ExtractStructuredContent<
        | { content: string }
        | { content: string; structuredContent: { hits: number } }
      >
    >().toEqualTypeOf<{ hits: number }>();
  });
});

describe("ExtractMeta", () => {
  it("pulls the _meta shape", () => {
    expectTypeOf<ExtractMeta<{ _meta: { traceId: string } }>>().toEqualTypeOf<{
      traceId: string;
    }>();
  });

  it("is unknown when the return declares no _meta", () => {
    expectTypeOf<ExtractMeta<{ content: string }>>().toBeUnknown();
  });

  it("pulls the shape from an optional _meta? (undefined stripped)", () => {
    expectTypeOf<
      ExtractMeta<{ content: string; _meta?: { traceId: string } }>
    >().toEqualTypeOf<{ traceId: string }>();
  });
});

describe("ExtendToolRegistry", () => {
  type Empty = Record<never, ToolDef>;

  it("adds a tool keyed by name with the inferred input/output/meta shapes", () => {
    type R = ExtendToolRegistry<
      Empty,
      "search",
      Schema,
      { hits: number },
      { tookMs: number }
    >;
    expectTypeOf<R["search"]>().toEqualTypeOf<
      ToolDef<
        { query: string; limit?: number | undefined },
        { hits: number },
        { tookMs: number }
      >
    >();
  });

  it("accumulates across registrations, inferring each entry's shapes", () => {
    const pingSchema = z.object({ n: z.number() });
    type R1 = ExtendToolRegistry<Empty, "search", Schema, { hits: number }>;
    type R2 = ExtendToolRegistry<
      R1,
      "ping",
      typeof pingSchema,
      { ok: boolean }
    >;
    expectTypeOf<keyof R2>().toEqualTypeOf<"search" | "ping">();
    // the second entry's input shape is inferred, not just its key — and the
    // omitted TResponseMetadata falls back to its `unknown` default.
    expectTypeOf<R2["ping"]>().toEqualTypeOf<
      ToolDef<{ n: number }, { ok: boolean }, unknown>
    >();
  });

  it("a schema-less registration stores empty args", () => {
    type R = ExtendToolRegistry<Empty, "noop", undefined, { ok: boolean }>;
    expectTypeOf<R["noop"]>().toEqualTypeOf<
      ToolDef<Record<never, never>, { ok: boolean }, unknown>
    >();
  });
});

describe("ToolHandler", () => {
  type H = ToolHandler<
    Schema,
    { content: string; structuredContent: { hits: number } }
  >;

  it("types args from the input schema", () => {
    expectTypeOf<Parameters<H>[0]>().toEqualTypeOf<{
      query: string;
      limit?: number | undefined;
    }>();
  });

  it("allows a sync or async return", () => {
    expectTypeOf<ReturnType<H>>().toEqualTypeOf<
      | { content: string; structuredContent: { hits: number } }
      | Promise<{ content: string; structuredContent: { hits: number } }>
    >();
  });

  it("widens the ctx's mcpReq._meta to carry Apps SDK client hints", () => {
    // The whole reason McpToolContext exists: `mcpReq._meta` is the v2 request
    // meta intersected with ClientHintsMeta, so handlers can read `openai/*`
    // hints without casting.
    expectTypeOf<H>().parameter(1).toEqualTypeOf<McpToolContext>();
    expectTypeOf<
      NonNullable<McpToolContext["mcpReq"]["_meta"]>["openai/locale"]
    >().toEqualTypeOf<string | undefined>();
  });
});

describe("ToolConfig and ClientHintsMeta", () => {
  it("ToolConfig.name is a string", () => {
    expectTypeOf<ToolConfig<Schema>["name"]>().toEqualTypeOf<string>();
  });

  it("ToolConfig.inputSchema carries the schema type", () => {
    expectTypeOf<ToolConfig<Schema>["inputSchema"]>().toEqualTypeOf<
      Schema | undefined
    >();
  });

  it("ClientHintsMeta fields are optional hints", () => {
    expectTypeOf<ClientHintsMeta["openai/locale"]>().toEqualTypeOf<
      string | undefined
    >();
    // every field is optional — an empty object is a valid ClientHintsMeta
    // (this assignment fails to compile if any field were required)
    const empty: ClientHintsMeta = {};
    expectTypeOf(empty).toEqualTypeOf<ClientHintsMeta>();
  });
});
