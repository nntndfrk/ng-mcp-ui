import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";
import { McpServer } from "./server.js";
import type { ViewName } from "./types.js";

// `ViewName` is narrowed to `never` until a `ViewNameRegistry` augmentation
// exists, so test view component names are cast.

describe("type-level: chained registerTool accumulates TTools", () => {
  it("$types.tools narrows tool names and input/output", () => {
    const server = new McpServer({ name: "t", version: "1.0.0" }, {})
      .registerTool(
        {
          name: "create_poll",
          inputSchema: { question: z.string() },
          view: { component: "poll" as ViewName },
        },
        async ({ question }) => ({
          content: "ok",
          structuredContent: { id: question },
        }),
      )
      .registerTool(
        {
          name: "tally_votes",
          inputSchema: { pollId: z.string() },
        },
        async ({ pollId }) => ({
          content: "ok",
          structuredContent: { count: pollId.length },
        }),
      );

    type Tools = (typeof server)["$types"]["tools"];
    expectTypeOf<keyof Tools>().toEqualTypeOf<"create_poll" | "tally_votes">();
    expectTypeOf<Tools["create_poll"]["input"]>().toEqualTypeOf<{
      question: string;
    }>();
    expectTypeOf<Tools["create_poll"]["output"]>().toEqualTypeOf<{
      id: string;
    }>();
    expectTypeOf<Tools["tally_votes"]["output"]>().toEqualTypeOf<{
      count: number;
    }>();
  });

  it("captures _meta (response metadata) into the registry", () => {
    const server = new McpServer({ name: "t", version: "1.0.0" }, {}).registerTool(
      {
        name: "with_meta",
        inputSchema: { id: z.string() },
      },
      async ({ id }) => ({
        content: "ok",
        structuredContent: { id },
        _meta: { traceId: id },
      }),
    );

    type Tools = (typeof server)["$types"]["tools"];
    expectTypeOf<Tools["with_meta"]["responseMetadata"]>().toEqualTypeOf<{
      traceId: string;
    }>();
  });
});
