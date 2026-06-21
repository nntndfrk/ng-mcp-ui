import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeClaudeContentDomain,
  computeViewVersionParam,
} from "./view-hashing.js";

describe("computeClaudeContentDomain", () => {
  it("hashes to <sha256[:32]>.claudemcpcontent.com", () => {
    // Anchor literal: sha256("https://example.com").slice(0, 32).
    expect(computeClaudeContentDomain("https://example.com")).toBe(
      "100680ad546ce6a577f42f52df33b4cf.claudemcpcontent.com",
    );
  });

  it("uses exactly 32 hex chars of the digest", () => {
    const domain = computeClaudeContentDomain("https://anything.example.com/x");
    const [hash, ...rest] = domain.split(".");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rest.join(".")).toBe("claudemcpcontent.com");
  });

  it("strips a lone trailing slash so it matches the registered connector URL", () => {
    expect(computeClaudeContentDomain("https://example.com/")).toBe(
      computeClaudeContentDomain("https://example.com"),
    );
  });

  it("strips only a single trailing slash, not repeated ones", () => {
    expect(computeClaudeContentDomain("https://example.com//")).not.toBe(
      computeClaudeContentDomain("https://example.com"),
    );
  });

  it("does not strip an internal or non-trailing slash", () => {
    const expected = `${createHash("sha256")
      .update("https://example.com/mcp")
      .digest("hex")
      .slice(0, 32)}.claudemcpcontent.com`;
    expect(computeClaudeContentDomain("https://example.com/mcp")).toBe(expected);
  });
});

describe("computeViewVersionParam", () => {
  it("returns ?v=<sha256(main\\0style)[:8]> in production", () => {
    // Anchor literal: sha256("main.abc.js\0styles.def.css").slice(0, 8).
    expect(
      computeViewVersionParam(
        { mainFile: "main.abc.js", styleFile: "styles.def.css" },
        { isProduction: true },
      ),
    ).toBe("?v=7bc1dad0");
  });

  it("treats a missing styleFile as the empty string", () => {
    // Anchor literal: sha256("main.abc.js\0").slice(0, 8).
    expect(
      computeViewVersionParam(
        { mainFile: "main.abc.js" },
        { isProduction: true },
      ),
    ).toBe("?v=ae903baf");
    expect(
      computeViewVersionParam(
        { mainFile: "main.abc.js", styleFile: null },
        { isProduction: true },
      ),
    ).toBe("?v=ae903baf");
  });

  it("is sensitive to both mainFile and styleFile", () => {
    const base = computeViewVersionParam(
      { mainFile: "a.js", styleFile: "a.css" },
      { isProduction: true },
    );
    expect(
      computeViewVersionParam(
        { mainFile: "b.js", styleFile: "a.css" },
        { isProduction: true },
      ),
    ).not.toBe(base);
    expect(
      computeViewVersionParam(
        { mainFile: "a.js", styleFile: "b.css" },
        { isProduction: true },
      ),
    ).not.toBe(base);
  });

  it("does not collide when the boundary moves (the NUL separator matters)", () => {
    // Without the "\0" join, ("ab","c") and ("a","bc") would hash identically.
    expect(
      computeViewVersionParam(
        { mainFile: "ab", styleFile: "c" },
        { isProduction: true },
      ),
    ).not.toBe(
      computeViewVersionParam(
        { mainFile: "a", styleFile: "bc" },
        { isProduction: true },
      ),
    );
  });

  it("returns '' outside production", () => {
    expect(
      computeViewVersionParam(
        { mainFile: "main.abc.js", styleFile: "styles.def.css" },
        { isProduction: false },
      ),
    ).toBe("");
  });

  it("returns '' when the manifest can't resolve mainFile", () => {
    expect(
      computeViewVersionParam(
        { mainFile: undefined, styleFile: "styles.def.css" },
        { isProduction: true },
      ),
    ).toBe("");
  });

  it("uses exactly 8 hex chars in the param", () => {
    const param = computeViewVersionParam(
      { mainFile: "main.abc.js", styleFile: "styles.def.css" },
      { isProduction: true },
    );
    expect(param).toMatch(/^\?v=[0-9a-f]{8}$/);
  });
});
