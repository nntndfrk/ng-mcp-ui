import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expectTypeOf, it } from "vitest";
import type {
  McpExtra,
  McpExtraFor,
  McpRequestParams,
  McpResultFor,
  McpWildcard,
} from "./middleware.js";

// Compile-time type tests. Run ONLY by `npm run test:types`.

describe("McpResultFor", () => {
  it("resolves an exact request method to its SDK result", () => {
    expectTypeOf<McpResultFor<"tools/call">>().toEqualTypeOf<CallToolResult>();
    expectTypeOf<
      McpResultFor<"resources/list">
    >().toEqualTypeOf<ListResourcesResult>();
  });

  it("resolves a wildcard to the union of matching results", () => {
    expectTypeOf<McpResultFor<"tools/*">>().toEqualTypeOf<
      CallToolResult | ListToolsResult
    >();
  });

  it("resolves a notification method to undefined", () => {
    expectTypeOf<
      McpResultFor<"notifications/initialized">
    >().toEqualTypeOf<undefined>();
  });
});

describe("McpExtraFor", () => {
  it("is McpExtra for request methods", () => {
    expectTypeOf<McpExtraFor<"tools/call">>().toEqualTypeOf<McpExtra>();
  });

  it("is undefined for notification methods", () => {
    expectTypeOf<
      McpExtraFor<"notifications/initialized">
    >().toEqualTypeOf<undefined>();
  });
});

describe("McpRequestParams", () => {
  it("narrows params for an exact request method", () => {
    expectTypeOf<McpRequestParams<"tools/call">>().toEqualTypeOf<
      CallToolRequest["params"]
    >();
  });
});

describe("McpWildcard", () => {
  it("includes wildcard prefixes derived from method strings", () => {
    expectTypeOf<"tools/*">().toExtend<McpWildcard>();
    expectTypeOf<"resources/*">().toExtend<McpWildcard>();
  });
});
