import { describe, expect, it } from "vitest";
import { isViewStateRecord } from "./adaptor.js";

// `restoreFromLocalStorage` reads a JSON string back from localStorage, which a
// corrupted or foreign write could have set to anything. `isViewStateRecord`
// is the guard that keeps `_viewState` within its `Record<string, unknown> |
// null` contract.
describe("isViewStateRecord", () => {
  it("accepts a plain object", () => {
    expect(isViewStateRecord({})).toBe(true);
    expect(isViewStateRecord({ a: 1, nested: { b: 2 } })).toBe(true);
  });

  it("rejects null, primitives and arrays", () => {
    expect(isViewStateRecord(null)).toBe(false);
    expect(isViewStateRecord(undefined)).toBe(false);
    expect(isViewStateRecord(42)).toBe(false);
    expect(isViewStateRecord("string")).toBe(false);
    expect(isViewStateRecord(true)).toBe(false);
    expect(isViewStateRecord([1, 2, 3])).toBe(false);
  });

  it("rejects the shapes a corrupted localStorage entry could hold", () => {
    // e.g. `JSON.parse` of "42", "\"x\"", "[1,2]" — all valid JSON, none a Record.
    expect(isViewStateRecord(JSON.parse("42"))).toBe(false);
    expect(isViewStateRecord(JSON.parse('"x"'))).toBe(false);
    expect(isViewStateRecord(JSON.parse("[1,2]"))).toBe(false);
    expect(isViewStateRecord(JSON.parse('{"ok":true}'))).toBe(true);
  });
});
