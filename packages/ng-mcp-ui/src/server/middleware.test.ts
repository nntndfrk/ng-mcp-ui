import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { describe, expect, it } from "vitest";
import {
  buildMiddlewareChain,
  getHandlerMaps,
  matchesFilter,
  type McpMiddlewareEntry,
} from "./middleware.js";

describe("matchesFilter", () => {
  it("matches an exact method", () => {
    expect(matchesFilter("tools/call", "tools/call", false)).toBe(true);
    expect(matchesFilter("tools/list", "tools/call", false)).toBe(false);
  });

  it("matches a wildcard prefix", () => {
    expect(matchesFilter("tools/call", "tools/*", false)).toBe(true);
    expect(matchesFilter("tools/list", "tools/*", false)).toBe(true);
    expect(matchesFilter("resources/list", "tools/*", false)).toBe(false);
  });

  it("matches the request / notification categories", () => {
    expect(matchesFilter("tools/call", "request", false)).toBe(true);
    expect(matchesFilter("tools/call", "request", true)).toBe(false);
    expect(matchesFilter("notifications/x", "notification", true)).toBe(true);
    expect(matchesFilter("notifications/x", "notification", false)).toBe(false);
  });
});

const passthrough = (label: string, log: string[]): McpMiddlewareEntry => ({
  filter: null,
  handler: async (_req, _extra, next) => {
    log.push(`before:${label}`);
    const result = await next();
    log.push(`after:${label}`);
    return result;
  },
});

describe("buildMiddlewareChain", () => {
  it("returns the original handler unchanged when no entry matches", () => {
    const handler = async () => ({ ok: true });
    const chain = buildMiddlewareChain("resources/list", false, handler, [
      { filter: "tools/*", handler: async (_r, _e, next) => next() },
    ]);
    expect(chain).toBe(handler);
  });

  it("runs middleware in onion order (first registered is outermost)", async () => {
    const log: string[] = [];
    const handler = async () => {
      log.push("handler");
      return { ok: true };
    };
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      passthrough("a", log),
      passthrough("b", log),
    ]);
    const result = await chain({ method: "tools/call", params: {} }, {});
    expect(result).toEqual({ ok: true });
    expect(log).toEqual([
      "before:a",
      "before:b",
      "handler",
      "after:b",
      "after:a",
    ]);
  });

  it("applies only the entries whose wildcard filter matches the method", async () => {
    const log: string[] = [];
    const handler = async () => {
      log.push("handler");
      return { ok: true };
    };
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      {
        filter: "resources/*",
        handler: async (_r, _e, next) => {
          log.push("resources");
          return next();
        },
      },
      {
        filter: "tools/*",
        handler: async (_r, _e, next) => {
          log.push("tools");
          return next();
        },
      },
    ]);
    await chain({ method: "tools/call", params: {} }, {});
    expect(log).toEqual(["tools", "handler"]);
  });

  it("matches an array filter via OR logic", async () => {
    const log: string[] = [];
    const handler = async () => ({ ok: true });
    const entry: McpMiddlewareEntry = {
      filter: ["resources/*", "tools/call"],
      handler: async (_r, _e, next) => {
        log.push("hit");
        return next();
      },
    };
    await buildMiddlewareChain("tools/call", false, handler, [entry])(
      { method: "tools/call", params: {} },
      {},
    );
    // prompts/list matches neither pattern → entry filtered out (handler only)
    const miss = buildMiddlewareChain("prompts/list", false, handler, [entry]);
    expect(miss).toBe(handler);
    expect(log).toEqual(["hit"]);
  });

  it("applies a category filter inside the chain", async () => {
    const log: string[] = [];
    const handler = async () => ({ ok: true });
    const entry: McpMiddlewareEntry = {
      filter: "request",
      handler: async (_r, _e, next) => {
        log.push("req");
        return next();
      },
    };
    await buildMiddlewareChain("tools/call", false, handler, [entry])(
      { method: "tools/call", params: {} },
      {},
    );
    // a notification does not match the "request" category → original handler
    expect(
      buildMiddlewareChain("notifications/x", true, handler, [entry]),
    ).toBe(handler);
    expect(log).toEqual(["req"]);
  });

  it("wraps a synchronous middleware return value in a promise", async () => {
    const handler = async () => ({ ok: true });
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      // not declared `async`; returns a plain value and never calls next()
      { filter: null, handler: () => ({ sync: true }) },
    ]);
    await expect(
      chain({ method: "tools/call", params: {} }, {}),
    ).resolves.toEqual({ sync: true });
  });

  it("short-circuits when a middleware does not call next()", async () => {
    let handlerRan = false;
    const handler = async () => {
      handlerRan = true;
      return { ok: true };
    };
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      { filter: null, handler: async () => ({ shortCircuit: true }) },
    ]);
    expect(await chain({ method: "tools/call", params: {} }, {})).toEqual({
      shortCircuit: true,
    });
    expect(handlerRan).toBe(false);
  });

  it("throws if a middleware calls next() more than once", async () => {
    const handler = async () => ({ ok: true });
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      {
        filter: null,
        handler: async (_r, _e, next) => {
          await next();
          return next();
        },
      },
    ]);
    await expect(
      chain({ method: "tools/call", params: {} }, {}),
    ).rejects.toThrow(/next\(\) called multiple times/);
  });

  it("passes extra for requests and undefined for notifications", async () => {
    const seen: unknown[] = [];
    const spy: McpMiddlewareEntry = {
      filter: null,
      handler: async (_req, extra, next) => {
        seen.push(extra);
        return next();
      },
    };
    const handler = async () => ({ ok: true });

    await buildMiddlewareChain("tools/call", false, handler, [spy])(
      { method: "tools/call", params: {} },
      { authInfo: "x" },
    );
    await buildMiddlewareChain("notifications/x", true, handler, [spy])({
      method: "notifications/x",
      params: {},
    });

    expect(seen[0]).toEqual({ authInfo: "x" });
    expect(seen[1]).toBeUndefined();
  });

  it("propagates params mutated by middleware to the original handler", async () => {
    const handler = async (req: { params: Record<string, unknown> }) =>
      req.params;
    const chain = buildMiddlewareChain("tools/call", false, handler, [
      {
        filter: null,
        handler: async (req, _e, next) => {
          (req.params as Record<string, unknown>).injected = true;
          return next();
        },
      },
    ]);
    const result = await chain(
      { method: "tools/call", params: { original: 1 } },
      {},
    );
    expect(result).toEqual({ original: 1, injected: true });
  });
});

describe("getHandlerMaps", () => {
  it("returns the SDK's request/notification handler maps", () => {
    const requestHandlers = new Map();
    const notificationHandlers = new Map();
    const fake = {
      _requestHandlers: requestHandlers,
      _notificationHandlers: notificationHandlers,
    } as unknown as Server;
    const maps = getHandlerMaps(fake);
    expect(maps.requestHandlers).toBe(requestHandlers);
    expect(maps.notificationHandlers).toBe(notificationHandlers);
  });

  it("throws fast on an incompatible SDK (missing handler maps)", () => {
    expect(() => getHandlerMaps({} as unknown as Server)).toThrow(
      /Incompatible MCP SDK version/,
    );
    expect(() =>
      getHandlerMaps({
        _requestHandlers: new Map(),
      } as unknown as Server),
    ).toThrow(/Incompatible MCP SDK version/);
  });
});
