// Unit tests for the sealed-state module (codec resolution + the
// `ctx.state` surface). The wire-level integration (tokens riding tool
// results, MRTR rounds) lives in server.test.ts.

import type { ServerContext } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRequestStateCodec,
  createSealedState,
  resolveStateCodec,
  SEALED_STATE_INVALID_MESSAGE,
  type StateOptions,
} from "./state.js";

const KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes

// The codec only reads `ctx` through the optional `bind` callback, so a
// plain object stands in for the full SDK context.
const ctx = {} as ServerContext;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("resolveStateCodec", () => {
  it("returns undefined when no state option is configured", () => {
    expect(resolveStateCodec(undefined)).toBeUndefined();
  });

  it("builds a codec from options with an explicit key", async () => {
    const codec = resolveStateCodec({ key: KEY });
    expect(codec).toBeDefined();
    const token = await codec?.mint({ n: 1 });
    expect(await codec?.verify(token as string, ctx)).toEqual({ n: 1 });
  });

  it("passes a ready-made codec through unchanged", () => {
    const codec = createRequestStateCodec({ key: KEY });
    expect(resolveStateCodec(codec)).toBe(codec);
  });

  it("throws in production when the key is omitted", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveStateCodec({})).toThrow(/state\.key.*production/);
  });

  it("mints an ephemeral key with a warning outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const codec = resolveStateCodec({});
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("ephemeral");
    // The ephemeral codec is functional within the process.
    const token = await codec?.mint("payload");
    expect(await codec?.verify(token as string, ctx)).toBe("payload");
  });

  it("forwards ttlSeconds and bind to the SDK codec", async () => {
    const options: StateOptions = {
      key: KEY,
      ttlSeconds: 60,
      bind: (c) => (c as { who?: string }).who ?? "",
    };
    const codec = resolveStateCodec(options);
    const alice = { who: "alice" } as unknown as ServerContext;
    const bob = { who: "bob" } as unknown as ServerContext;
    const token = (await codec?.mint({ n: 1 }, alice)) as string;
    await expect(codec?.verify(token, alice)).resolves.toEqual({ n: 1 });
    // A token minted under one binding is rejected under another.
    await expect(codec?.verify(token, bob)).rejects.toThrow();
  });
});

describe("createSealedState", () => {
  const codec = createRequestStateCodec({ key: KEY });
  const state = createSealedState(codec, ctx);

  it("round-trips a payload through seal/open", async () => {
    const token = await state.seal({ pollId: "p1", total: 3 });
    expect(typeof token).toBe("string");
    await expect(state.open(token)).resolves.toEqual({
      pollId: "p1",
      total: 3,
    });
  });

  it("rejects a tampered token with the stable message", async () => {
    const token = await state.seal({ n: 1 });
    // Flip a character in the MAC segment.
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A");
    await expect(state.open(tampered)).rejects.toThrow(
      SEALED_STATE_INVALID_MESSAGE,
    );
  });

  it("rejects garbage with the stable message and keeps the reason on cause", async () => {
    const failure = await state.open("not-a-token").catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(SEALED_STATE_INVALID_MESSAGE);
    expect((failure as Error).cause).toBeDefined();
  });

  it("rejects an expired token", async () => {
    const shortLived = createSealedState(
      createRequestStateCodec({ key: KEY, ttlSeconds: 10 }),
      ctx,
    );
    vi.useFakeTimers();
    const token = await shortLived.seal({ n: 1 });
    vi.setSystemTime(Date.now() + 11_000);
    await expect(shortLived.open(token)).rejects.toThrow(
      SEALED_STATE_INVALID_MESSAGE,
    );
  });
});
