import { describe, expect, it } from "vitest";
import { text } from "./content-helpers.js";
import { normalizeContent } from "./normalize-content.js";

describe("normalizeContent", () => {
  it("returns an empty array for undefined", () => {
    expect(normalizeContent(undefined)).toEqual([]);
  });

  it("wraps a plain string as a single TextContent", () => {
    expect(normalizeContent("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("wraps a single content block in an array", () => {
    const block = text("hi");
    expect(normalizeContent(block)).toEqual([block]);
  });

  it("passes an array of content blocks through unchanged", () => {
    const blocks = [text("a"), text("b")];
    expect(normalizeContent(blocks)).toBe(blocks);
  });
});
