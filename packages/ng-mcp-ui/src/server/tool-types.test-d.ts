import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { ToolDef } from "./types.js";
import type {
  ClientHintsMeta,
  ExtendToolRegistry,
  ExtractMeta,
  ExtractStructuredContent,
  ShapeOutput,
  ToolConfig,
  ToolHandler,
  ToolHandlerExtra,
} from "./tool-types.js";

// Compile-time type tests. Run ONLY by `npm run test:types`
// (`vitest run --typecheck.only`), never by the runtime `npm test`.

const shape = {
  query: z.string(),
  limit: z.number().optional(),
};
type Shape = typeof shape;

describe("ShapeOutput", () => {
  it("keeps required schemas required and makes optional schemas optional", () => {
    expectTypeOf<ShapeOutput<Shape>>().toEqualTypeOf<{
      query: string;
      limit?: number;
    }>();
  });

  it("an empty shape yields an empty object", () => {
    expectTypeOf<ShapeOutput<Record<string, never>>>().toEqualTypeOf<
      Record<string, never>
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
    expectTypeOf<
      ExtractStructuredContent<{ content: string }>
    >().toBeNever();
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
        { content: string } | { content: string; structuredContent: { hits: number } }
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
      Shape,
      { hits: number },
      { tookMs: number }
    >;
    expectTypeOf<R["search"]>().toEqualTypeOf<
      ToolDef<{ query: string; limit?: number }, { hits: number }, { tookMs: number }>
    >();
  });

  it("accumulates across registrations, inferring each entry's shapes", () => {
    type R1 = ExtendToolRegistry<Empty, "search", Shape, { hits: number }>;
    type R2 = ExtendToolRegistry<R1, "ping", { n: z.ZodNumber }, { ok: boolean }>;
    expectTypeOf<keyof R2>().toEqualTypeOf<"search" | "ping">();
    // the second entry's input shape is inferred, not just its key — and the
    // omitted TResponseMetadata falls back to its `unknown` default.
    expectTypeOf<R2["ping"]>().toEqualTypeOf<
      ToolDef<{ n: number }, { ok: boolean }, unknown>
    >();
  });
});

describe("ToolHandler", () => {
  type H = ToolHandler<Shape, { content: string; structuredContent: { hits: number } }>;

  it("types args from the input shape", () => {
    expectTypeOf<Parameters<H>[0]>().toEqualTypeOf<{
      query: string;
      limit?: number;
    }>();
  });

  it("allows a sync or async return", () => {
    expectTypeOf<ReturnType<H>>().toEqualTypeOf<
      | { content: string; structuredContent: { hits: number } }
      | Promise<{ content: string; structuredContent: { hits: number } }>
    >();
  });

  it("widens the extra's _meta to carry Apps SDK client hints", () => {
    // The whole reason ToolHandlerExtra exists: `_meta` is the SDK extra's meta
    // intersected with ClientHintsMeta, so handlers can read `openai/*` hints.
    expectTypeOf<H>().parameter(1).toEqualTypeOf<ToolHandlerExtra>();
    expectTypeOf<
      NonNullable<ToolHandlerExtra["_meta"]>["openai/locale"]
    >().toEqualTypeOf<string | undefined>();
  });
});

describe("ToolConfig and ClientHintsMeta", () => {
  it("ToolConfig.name is a string", () => {
    expectTypeOf<ToolConfig<Shape>["name"]>().toEqualTypeOf<string>();
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
