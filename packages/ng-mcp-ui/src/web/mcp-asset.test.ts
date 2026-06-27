import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";
import { resolveMcpAsset } from "./mcp-asset.js";
import { McpAssetPipe } from "./mcp-asset.pipe.js";
import { MCP_SERVER_URL } from "./tokens.js";

/**
 * The resolver (`mcp-asset.ts`) holds the URL logic; the pipe shell
 * (`mcp-asset.pipe.ts`) is a one-line delegate over it. These tests cover the
 * resolver across the three injected `serverUrl` cases, plus the decorated
 * {@link McpAssetPipe} itself to prove the `@Pipe` + `inject(MCP_SERVER_URL)`
 * wiring (the package tsconfig's `experimentalDecorators` lets Vitest's esbuild
 * transform down-level the decorator — see packages/ng-mcp-ui/tsconfig.json).
 */
describe("resolveMcpAsset", () => {
  it("dev (empty serverUrl) → returns the relative path unchanged", () => {
    expect(resolveMcpAsset("", "media/poll.png")).toBe("media/poll.png");
  });

  it("tunnel URL → prefixes with origin + /assets/widgets/", () => {
    expect(
      resolveMcpAsset("https://abc123.trycloudflare.com", "media/poll.png"),
    ).toBe("https://abc123.trycloudflare.com/assets/widgets/media/poll.png");
  });

  it("prod URL → prefixes with origin + /assets/widgets/", () => {
    expect(resolveMcpAsset("https://app.example.com", "media/poll.png")).toBe(
      "https://app.example.com/assets/widgets/media/poll.png",
    );
  });

  it("normalizes a trailing slash on the origin and a leading slash on the path", () => {
    expect(resolveMcpAsset("https://app.example.com/", "/media/poll.png")).toBe(
      "https://app.example.com/assets/widgets/media/poll.png",
    );
  });
});

describe("McpAssetPipe", () => {
  function makePipe(serverUrl: string): McpAssetPipe {
    const injector = Injector.create({
      providers: [{ provide: MCP_SERVER_URL, useValue: serverUrl }],
    });
    return runInInjectionContext(injector, () => new McpAssetPipe());
  }

  it("transform() resolves against the injected MCP_SERVER_URL", () => {
    expect(makePipe("https://app.example.com").transform("media/poll.png")).toBe(
      "https://app.example.com/assets/widgets/media/poll.png",
    );
  });

  it("transform() returns the relative path when serverUrl is empty (dev)", () => {
    expect(makePipe("").transform("media/poll.png")).toBe("media/poll.png");
  });
});
