/**
 * @internal
 * Deep-merge `source` into `target`: arrays are **unioned and deduped**, nested
 * plain objects are merged recursively, and `undefined` source values are
 * skipped (so an absent override never clears a default). Primitive/array vs
 * object mismatches take the source value. Returns a new object — neither input
 * is mutated.
 *
 * Used to combine a view resource's default `_meta`/CSP (server-derived domains)
 * with per-view overrides without dropping either side's domain lists.
 */
export function mergeWithUnion<T extends object, S extends object>(
  target: T,
  source: S,
): T & S {
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
    } else if (
      targetVal &&
      sourceVal &&
      typeof targetVal === "object" &&
      typeof sourceVal === "object" &&
      !Array.isArray(targetVal) &&
      !Array.isArray(sourceVal)
    ) {
      out[key] = mergeWithUnion(targetVal as object, sourceVal as object);
    } else {
      out[key] = sourceVal;
    }
  }

  return out as T & S;
}
