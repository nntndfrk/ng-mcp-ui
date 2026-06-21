import { describe, expect, it } from "vitest";
import {
  readHeader,
  resolveConnectDomains,
  resolveServerUrl,
} from "./request-context.js";

describe("readHeader", () => {
  it("returns a single header value", () => {
    expect(readHeader({ host: "a.com" }, "host")).toBe("a.com");
  });

  it("takes the first entry of a repeated header", () => {
    expect(readHeader({ host: ["a.com", "b.com"] }, "host")).toBe("a.com");
  });

  it("returns undefined for an absent header", () => {
    expect(readHeader({}, "host")).toBeUndefined();
  });
});

describe("resolveServerUrl", () => {
  it("prefers x-forwarded-host with its proto (tunnel/proxy)", () => {
    expect(
      resolveServerUrl({
        "x-forwarded-host": "abc.trycloudflare.com",
        "x-forwarded-proto": "https",
      }),
    ).toBe("https://abc.trycloudflare.com");
  });

  it("defaults x-forwarded-proto to https", () => {
    expect(resolveServerUrl({ "x-forwarded-host": "abc.example.com" })).toBe(
      "https://abc.example.com",
    );
  });

  it("falls back to origin when no forwarded host", () => {
    expect(resolveServerUrl({ origin: "https://app.example.com" })).toBe(
      "https://app.example.com",
    );
  });

  it("uses http for a localhost host", () => {
    expect(resolveServerUrl({ host: "localhost:4200" })).toBe(
      "http://localhost:4200",
    );
  });

  it("uses http for a 127.0.0.1 host", () => {
    expect(resolveServerUrl({ host: "127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("uses https for a non-local host", () => {
    expect(resolveServerUrl({ host: "example.com" })).toBe(
      "https://example.com",
    );
  });

  it("prioritizes forwarded host over origin and host", () => {
    expect(
      resolveServerUrl({
        "x-forwarded-host": "tunnel.example.com",
        origin: "https://ignored.example.com",
        host: "ignored.example.com",
      }),
    ).toBe("https://tunnel.example.com");
  });

  it("falls back to an injected dev port", () => {
    expect(resolveServerUrl({}, { devPort: "4000" })).toBe(
      "http://localhost:4000",
    );
  });

  it("defaults the dev port to 3000", () => {
    const saved = process.env.__PORT;
    delete process.env.__PORT;
    try {
      expect(resolveServerUrl({})).toBe("http://localhost:3000");
    } finally {
      if (saved !== undefined) {
        process.env.__PORT = saved;
      }
    }
  });
});

describe("resolveConnectDomains", () => {
  it("returns only the server origin in production", () => {
    expect(
      resolveConnectDomains("https://app.example.com", { isProduction: true }),
    ).toEqual(["https://app.example.com"]);
  });

  it("adds the wss origin outside production for an https server", () => {
    expect(
      resolveConnectDomains("https://app.example.com", { isProduction: false }),
    ).toEqual(["https://app.example.com", "wss://app.example.com"]);
  });

  it("adds the ws origin outside production for an http server", () => {
    expect(
      resolveConnectDomains("http://localhost:4200", { isProduction: false }),
    ).toEqual(["http://localhost:4200", "ws://localhost:4200"]);
  });
});
