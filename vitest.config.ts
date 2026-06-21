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
      // (`vitest run --typecheck.only`), never as a runtime suite.
      "**/*.test-d.ts",
    ],
    typecheck: {
      // Enabled only via `--typecheck.only` (the `test:types` script). Scopes the
      // type-test run to our packages' `*.test-d.ts` files and points at a
      // dedicated strict tsconfig that INCLUDES them (the root solution tsconfig
      // would not). The top-level `exclude` does not apply to typecheck
      // collection, so the read-only reference under `.claude/**` is re-excluded.
      include: ["packages/**/*.test-d.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
      tsconfig: "packages/ng-mcp-ui/tsconfig.test-d.json",
    },
  },
});
