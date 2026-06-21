/**
 * @internal
 * Framework-free structural equality used to dedupe host-context snapshots.
 *
 * Avoids a dependency on `dequal/lite`, which this package does not pull in.
 * This is a small recursive deep-equal over plain objects, arrays, primitives,
 * Dates and RegExps (`dequal/lite`-equivalent). Intentionally no
 * Map/Set/TypedArray support — host-context snapshots are JSON-like values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a === "number" && typeof b === "number") {
    // Mirror dequal: NaN equals NaN. Any non-NaN pair already failed `a === b`.
    return Number.isNaN(a) && Number.isNaN(b);
  }

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  // Mirror dequal/lite: distinct types are never equal, and Date/RegExp
  // compare by value — without this, two different Dates (zero own keys)
  // would compare equal and silently suppress a host-context update.
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a instanceof Date) {
    return a.getTime() === (b as Date).getTime();
  }
  if (a instanceof RegExp) {
    return a.source === (b as RegExp).source && a.flags === (b as RegExp).flags;
  }

  const arrayA = Array.isArray(a);
  const arrayB = Array.isArray(b);
  if (arrayA !== arrayB) {
    return false;
  }

  if (arrayA && arrayB) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key) || !deepEqual(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
}
