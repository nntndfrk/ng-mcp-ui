import { expectTypeOf, test } from "vitest";
import { mergeWithUnion } from "./merge-with-union.js";

// Locks the overwrite-merge return type. With the old `T & S` signature,
// `merged.a` would be `string & number` (impossible); `Omit<T, keyof S> & S`
// correctly yields the source type for overlapping keys.
test("overlapping keys take the source type, not an impossible intersection", () => {
  const merged = mergeWithUnion({ a: "x", keep: 1 }, { a: 42 });
  expectTypeOf(merged.a).toEqualTypeOf<number>();
  expectTypeOf(merged.keep).toEqualTypeOf<number>();
});
