import { expectTypeOf, test } from "vitest";
import * as z from "zod";
import { McpServer } from "../server/index.js";
import { injectAppHelpers } from "./inject-app-helpers.js";

// A real server type, built with chained `registerTool` calls, exactly as an
// app author would. `injectAppHelpers<AppType>()` reads the tool registry from
// `typeof server`'s structural `$types` marker. These tests are compile-time
// only (`expectTypeOf` / `@ts-expect-error`); the wrapper bodies never run, so
// no injection context / TestBed is needed.
const server = new McpServer({ name: "test-app", version: "1.0.0" }, {})
  .registerTool(
    {
      name: "search-trip",
      description: "Search for trips",
      inputSchema: {
        destination: z.string(),
        maxPrice: z.number().optional(),
      },
      outputSchema: {
        results: z.array(z.object({ id: z.string(), price: z.number() })),
        totalCount: z.number(),
      },
    },
    async ({ destination }) => ({
      content: [{ type: "text", text: `Found trips to ${destination}` }],
      structuredContent: {
        results: [{ id: "1", price: 1000 }],
        totalCount: 1,
      },
    }),
  )
  .registerTool(
    {
      name: "no-input-view",
      description: "View with no input",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: "No input needed" }],
      structuredContent: { ok: true },
    }),
  )
  .registerTool(
    {
      name: "view-with-metadata",
      description: "View that returns response metadata",
      inputSchema: { resourceId: z.string() },
    },
    async ({ resourceId }) => ({
      content: [{ type: "text", text: `Resource: ${resourceId}` }],
      structuredContent: { loaded: true },
      _meta: { requestId: "req-123", cached: false },
    }),
  );

type AppType = typeof server;

test("injectCallTool autocompletes valid tool names and rejects invalid ones", () => {
  const { injectCallTool } = injectAppHelpers<AppType>();

  injectCallTool("search-trip");
  injectCallTool("no-input-view");
  injectCallTool("view-with-metadata");

  // @ts-expect-error - "invalid-name" is not a registered tool
  injectCallTool("invalid-name");
});

test("injectToolInfo autocompletes valid tool names and rejects invalid ones", () => {
  const { injectToolInfo } = injectAppHelpers<AppType>();

  injectToolInfo<"search-trip">();
  injectToolInfo<"no-input-view">();
  injectToolInfo<"view-with-metadata">();

  // @ts-expect-error - "invalid-name" is not a registered tool
  injectToolInfo<"invalid-name">();
});

test("callTool args are typed to the tool's input schema", () => {
  const { injectCallTool } = injectAppHelpers<AppType>();
  const { callTool } = injectCallTool("search-trip");

  callTool({ destination: "Spain" });
  callTool({ destination: "France", maxPrice: 1000 });

  // @ts-expect-error - "destination" is required
  callTool({});

  // @ts-expect-error - "destination" is required
  callTool();
});

test("callTool needs no args for tools with no required inputs", () => {
  const { injectCallTool } = injectAppHelpers<AppType>();
  const { callTool, callToolAsync } = injectCallTool("no-input-view");

  callTool();
  callTool({});
  callToolAsync();
});

test("data().structuredContent is typed from the output schema", () => {
  const { injectCallTool } = injectAppHelpers<AppType>();
  const { data } = injectCallTool("search-trip");

  const current = data();
  if (current) {
    // Exact match (not just `toBeArray`) proves the output schema is inferred
    // end-to-end and `structuredContent` is not left as `unknown`.
    expectTypeOf(current.structuredContent).toEqualTypeOf<{
      results: { id: string; price: number }[];
      totalCount: number;
    }>();
  }
});

test("injectToolInfo narrows input and output by state", () => {
  const { injectToolInfo } = injectAppHelpers<AppType>();
  const state = injectToolInfo<"search-trip">()();

  if (state.status !== "idle") {
    expectTypeOf(state.input.destination).toBeString();
    expectTypeOf(state.input.maxPrice).toEqualTypeOf<number | undefined>();
  }

  // In success state `output` is `TOutput | null`: `deriveStatus` reaches
  // `success` as soon as *either* `output` or `responseMetadata` arrives, so a
  // null guard is required before the schema-narrowed fields are reachable.
  if (state.isSuccess && state.output) {
    expectTypeOf(state.output.results).toBeArray();
    expectTypeOf(state.output.totalCount).toBeNumber();
  }
});

test("injectToolInfo infers responseMetadata from the callback's _meta", () => {
  const { injectToolInfo } = injectAppHelpers<AppType>();
  const state = injectToolInfo<"view-with-metadata">()();

  // Same nullability as `output`: `responseMetadata` is `TResponseMetadata |
  // null` in success state (an mcp-app host can push `output` without `_meta`).
  if (state.isSuccess && state.responseMetadata) {
    expectTypeOf(state.responseMetadata.requestId).toBeString();
    expectTypeOf(state.responseMetadata.cached).toBeBoolean();
  }
});

test("callTool sideEffects callbacks are typed to input and output", () => {
  const { injectCallTool } = injectAppHelpers<AppType>();
  const { callTool } = injectCallTool("search-trip");

  callTool(
    { destination: "Spain" },
    {
      onSuccess: (response, args) => {
        expectTypeOf(response.structuredContent.totalCount).toBeNumber();
        expectTypeOf(args.destination).toBeString();
      },
    },
  );
});
