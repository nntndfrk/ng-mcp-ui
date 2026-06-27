#!/usr/bin/env node
// Remove build output so `tsc -b` does a clean rebuild.
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
rmSync(join(pkgRoot, "dist"), { recursive: true, force: true });
console.log("clean: removed dist/");
