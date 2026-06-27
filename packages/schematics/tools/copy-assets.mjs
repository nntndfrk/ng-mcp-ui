#!/usr/bin/env node
// tsc emits only .js/.d.ts; the schematics runtime also needs the JSON assets
// (collection.json + each schematic's schema.json) in dist with the same layout
// as src. Copy them after `tsc -b`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(pkgRoot, "src");
const dist = join(pkgRoot, "dist");

const assets = ["collection.json", "ng-add/schema.json"];

for (const rel of assets) {
  const to = join(dist, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(src, rel), to);
}

// Scaffold templates (`<schematic>/files/**`) are .ts/.mjs/.json/.html source
// TREATED AS DATA by a schematic at runtime (apply(url("./files"))). tsc does
// not emit them (and must not — they are not part of the schematic's own
// compilation), so copy each schematic's `files/` tree recursively into dist.
// Discovered dynamically: any `src/<schematic>/files` directory ships, so a new
// generator just drops its `files/` tree and needs no edit here.
const fileTrees = readdirSync(src, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(src, e.name, "files")))
  .map((e) => `${e.name}/files`);
for (const rel of fileTrees) {
  const to = join(dist, rel);
  // Clear any stale tree first so renamed/removed templates (e.g. a `.template`
  // rename) don't linger in dist across incremental (non-clean) rebuilds.
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(src, rel), to, { recursive: true });
}

console.log(
  `copy-assets: copied ${assets.length} JSON asset(s) + ${fileTrees.length} template tree(s) [${fileTrees.join(", ")}] to dist/`,
);
