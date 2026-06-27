#!/usr/bin/env node
// M7 single-package merge: bundle the sibling `ng-mcp-ui-schematics` build into
// this library's published tree under `dist/schematics/`, so the lib's
// `"schematics": "./dist/schematics/collection.json"` field works and
// `ng add ng-mcp-ui` runs the generators directly.
//
// The two packages keep SEPARATE builds and emit profiles (this lib = ESM via
// ngc partial mode; schematics = CommonJS via tsc) — we only copy the schematics
// DIST into this package's dist at pack time. collection.json factory paths are
// relative, so a verbatim directory copy preserves them.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url))); // packages/ng-mcp-ui
const schematicsDir = join(pkgRoot, "..", "schematics");
const schematicsDist = join(schematicsDir, "dist");
const dest = join(pkgRoot, "dist", "schematics");

// 1. Build the schematics package (tsc -b + copy-assets) so its dist is fresh.
const build = spawnSync("npm", ["run", "build"], {
  cwd: schematicsDir,
  stdio: "inherit",
  encoding: "utf8",
});
if (build.status !== 0) {
  console.error("embed-schematics: schematics build failed");
  process.exit(build.status ?? 1);
}

// 2. Copy the schematics dist verbatim into this package's dist/schematics.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(schematicsDist, dest, { recursive: true });

// 2a. The schematics are CommonJS (`@angular-devkit/schematics` require()s the
//     factory modules), but this lib package is ESM (`"type": "module"`). Without
//     an override, Node would treat the embedded `.js` as ESM and the CJS
//     `exports`/`require` would throw. A nested `package.json` re-scopes this
//     subtree to CommonJS — the standard dual-format marker.
writeFileSync(
  join(dest, "package.json"),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
);

// 3. Assert the embedded tree is complete (collection + the ng-add factory +
//    schema). A missing piece means `ng add` would fail at runtime, so fail the
//    pack instead.
const required = [
  "collection.json",
  "ng-add/index.js",
  "ng-add/schema.json",
  "ng-add/files",
  "view/index.js",
  "view/schema.json",
  "view/files",
  "tool/index.js",
  "tool/schema.json",
  "tool/files",
  "example/index.js",
  "example/schema.json",
  "example/files",
];
const missing = required.filter((rel) => !existsSync(join(dest, rel)));
if (missing.length > 0) {
  console.error(
    `embed-schematics: embedded tree incomplete — missing:\n` +
      missing.map((m) => `  - dist/schematics/${m}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  `embed-schematics: embedded ${required.length} schematics asset(s) into dist/schematics/`,
);
