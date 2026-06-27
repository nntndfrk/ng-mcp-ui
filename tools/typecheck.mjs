#!/usr/bin/env node
// Workspace typecheck driver. The library compiles with `ngc` (Angular compiler)
// in partial-compilation mode — it both type-checks AND emits dist/* with Ivy
// partial metadata, identical to the package's own `build`, so typecheck and
// build can run in any order without one clobbering the other's dist (a plain
// `tsc -b` would overwrite the partial output with metadata-less JS and break AOT
// consumers once declarables land). Workspace-level tooling (vitest.config.ts) is
// checked by the root tsconfig. More steps are added as packages land.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = (name) =>
  join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

const steps = [
  {
    label: "ng-mcp-ui (ngc partial)",
    cmd: bin("ngc"),
    args: ["-p", "packages/ng-mcp-ui/tsconfig.json"],
  },
  {
    // Build (not just typecheck) the schematics package: it EMITS dist incl. the
    // JSON assets (collection.json + ng-add/schema.json), mirroring the ngc step
    // above, so the schematic test can read dist/collection.json. npm is on PATH
    // (we don't use bin("npm"), which won't resolve on Windows).
    label: "schematics (build)",
    cmd: "npm",
    args: ["run", "build", "--workspace", "ng-mcp-ui-schematics"],
  },
  {
    label: "workspace tooling (tsc)",
    cmd: bin("tsc"),
    args: ["-p", "tsconfig.json"],
  },
];

for (const { label, cmd, args } of steps) {
  console.log(`typecheck: ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
