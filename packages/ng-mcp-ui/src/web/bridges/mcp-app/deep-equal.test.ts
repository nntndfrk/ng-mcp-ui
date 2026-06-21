import { describe, expect, it } from "vitest";
import { deepEqual } from "./deep-equal.js";

describe("deepEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("treats differing primitives as unequal", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, null)).toBe(false);
  });

  it("treats NaN as equal to NaN", () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it("compares plain objects structurally", () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("compares nested objects and arrays", () => {
    expect(
      deepEqual(
        { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
        { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
      ),
    ).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
  });

  it("distinguishes arrays from objects and by length", () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("compares Dates and RegExps by value (dequal/lite parity)", () => {
    expect(deepEqual(new Date(1000), new Date(1000))).toBe(true);
    expect(deepEqual(new Date(1000), new Date(2000))).toBe(false);
    expect(deepEqual(/ab/g, /ab/g)).toBe(true);
    expect(deepEqual(/ab/g, /ab/i)).toBe(false);
    expect(deepEqual(/ab/g, /ac/g)).toBe(false);
    // distinct constructors are never equal
    expect(deepEqual(new Date(0), {})).toBe(false);
  });
});
