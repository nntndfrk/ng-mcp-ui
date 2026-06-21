/**
 * @internal
 * True for objects whose prototype is `Object.prototype` or `null` (plain
 * JSON-like records) — excludes arrays, `Date`/`Map`/`RegExp`, and class
 * instances, which must be overwritten wholesale rather than recursively merged
 * (recursing would spread away their prototype).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @internal
 * Overwrite-merge `source` onto `target`: arrays are **unioned and deduped**,
 * nested **plain** objects are merged recursively, and `undefined` source values
 * are skipped (so an absent override never clears a default). For any other
 * overlapping value — primitive, array-vs-object mismatch, or a non-plain object
 * (`Date`, class instance, …) — the source value wins. Returns a new object;
 * neither input is mutated.
 *
 * Used to combine a view resource's default `_meta`/CSP (server-derived domains)
 * with per-view overrides without dropping either side's domain lists.
 *
 * The return type is `Omit<T, keyof S> & S` (overwrite semantics) rather than
 * `T & S`, which would intersect overlapping keys into impossible types
 * (e.g. `string & number`).
 */
export function mergeWithUnion<T extends object, S extends object>(
  target: T,
  source: S,
): Omit<T, keyof S> & S {
  const out: Record<string, unknown> = Array.isArray(target)
    ? ([...(target as unknown[])] as unknown as Record<string, unknown>)
    : { ...(target as Record<string, unknown>) };

  for (const [key, sourceVal] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (sourceVal === undefined) {
      continue;
    }
    const targetVal = out[key];
    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      out[key] = [...new Set([...targetVal, ...sourceVal])];
    } else if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      out[key] = mergeWithUnion(targetVal, sourceVal);
    } else {
      out[key] = sourceVal;
    }
  }

  return out as Omit<T, keyof S> & S;
}
