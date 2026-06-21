import { expectTypeOf, test } from "vitest";
import type { ViewConfig, ViewName } from "./types.js";

// Compile-time tests for the view-name registry behavior. Run only by
// `npm run test:types`.

// In the library's own context (and any consumer without a generated
// `views.d.ts`), `ViewNameRegistry` has no augmentations, so `ViewName` must
// default to `string` — otherwise `keyof {}` would make it `never` and
// `ViewConfig.component` impossible to set. A generated augmentation narrows it
// to the registered union; that narrowing can't be exercised here because this
// compilation has no augmentation.
test("ViewName defaults to string without a ViewNameRegistry augmentation", () => {
  expectTypeOf<ViewName>().toEqualTypeOf<string>();
});

test("ViewConfig.component accepts a plain string in an un-augmented project", () => {
  expectTypeOf<ViewConfig["component"]>().toEqualTypeOf<string>();
});
