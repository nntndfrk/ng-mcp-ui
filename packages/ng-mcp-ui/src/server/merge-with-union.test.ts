import { describe, expect, it } from "vitest";
import { mergeWithUnion } from "./merge-with-union.js";

describe("mergeWithUnion", () => {
  it("unions and dedupes arrays", () => {
    expect(
      mergeWithUnion({ domains: ["a", "b"] }, { domains: ["b", "c"] }),
    ).toEqual({ domains: ["a", "b", "c"] });
  });

  it("merges nested plain objects recursively", () => {
    expect(
      mergeWithUnion(
        { csp: { resource: ["a"], connect: ["x"] } },
        { csp: { resource: ["b"], frame: ["f"] } },
      ),
    ).toEqual({ csp: { resource: ["a", "b"], connect: ["x"], frame: ["f"] } });
  });

  it("skips undefined source values (an absent override never clears a default)", () => {
    expect(
      mergeWithUnion({ domain: "default.com" }, { domain: undefined }),
    ).toEqual({ domain: "default.com" });
  });

  it("takes the source value for primitives", () => {
    expect(mergeWithUnion({ border: false }, { border: true })).toEqual({
      border: true,
    });
  });

  it("adds keys present only in the source", () => {
    expect(mergeWithUnion({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("does not mutate either input", () => {
    const target = { domains: ["a"] };
    const source = { domains: ["b"] };
    mergeWithUnion(target, source);
    expect(target).toEqual({ domains: ["a"] });
    expect(source).toEqual({ domains: ["b"] });
  });

  it("replaces an object target when the source value is a primitive/array", () => {
    expect(mergeWithUnion({ v: { nested: true } }, { v: ["x"] })).toEqual({
      v: ["x"],
    });
  });
});
