import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace packages add their own suites as they land. Exclude the
    // read-only reference/scratch dirs and the (non-vitest) example apps so
    // their files never run here.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      "spike/**",
      "examples/**",
      // Compile-time type tests run only via the dedicated `test:types` script
      // (returns with the first package that ships public generics).
      "**/*.test-d.ts",
    ],
  },
});
