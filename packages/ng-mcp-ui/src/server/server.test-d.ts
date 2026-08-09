import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";
import { McpServer } from "./server.js";
import { inputRequired } from "./state.js";
import type { ViewName } from "./types.js";

// `ViewName` is narrowed to `never` until a `ViewNameRegistry` augmentation
// exists, so test view component names are cast.

describe("type-level: chained registerTool accumulates TTools", () => {
  it("$types.tools narrows tool names and input/output", () => {
    const server = new McpServer({ name: "t", version: "1.0.0" }, {})
      .registerTool(
        {
          name: "create_poll",
          inputSchema: z.object({ question: z.string() }),
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
          inputSchema: z.object({ pollId: z.string() }),
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
    const server = new McpServer(
      { name: "t", version: "1.0.0" },
      {},
    ).registerTool(
      {
        name: "with_meta",
        inputSchema: z.object({ id: z.string() }),
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

describe("type-level: MRTR input_required returns", () => {
  it("registerTool accepts a handler that may return inputRequired() and keeps the completing member's output", () => {
    const server = new McpServer(
      { name: "t", version: "1.0.0" },
      {},
    ).registerTool(
      {
        name: "confirm_delete",
        inputSchema: z.object({ target: z.string() }),
      },
      async ({ target }) =>
        target === "?"
          ? inputRequired({ requestState: "opaque" })
          : { content: "ok", structuredContent: { deleted: target } },
    );

    type Tools = (typeof server)["$types"]["tools"];
    expectTypeOf<Tools["confirm_delete"]["output"]>().toEqualTypeOf<{
      deleted: string;
    }>();
  });
});
