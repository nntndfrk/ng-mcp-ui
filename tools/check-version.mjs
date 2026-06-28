#!/usr/bin/env node
// Versioning gate. Three things must agree before `ng-mcp-ui` is published:
//   1. packages/ng-mcp-ui/package.json#version   (the npm version)
//   2. NG_MCP_UI_VERSION in src/version.ts        (re-exported from every entry)
//   3. the release git tag `vX.Y.Z`               (only checked with --tag)
// The published `NG_MCP_UI_VERSION` constant is hand-maintained, so it can drift
// from package.json; this script fails loudly instead of shipping a wrong value.
//
// Usage:
//   node tools/check-version.mjs                 # assert (1) === (2)
//   node tools/check-version.mjs --tag v0.1.0    # also assert (3) === (1)
//   node tools/check-version.mjs --tag $GITHUB_REF_NAME
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(repoRoot, "packages", "ng-mcp-ui");

const pkgVersion = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8"),
).version;

// Parse the constant out of source rather than importing (no build needed).
const versionTs = readFileSync(join(pkgDir, "src", "version.ts"), "utf8");
const m = versionTs.match(/NG_MCP_UI_VERSION\s*=\s*["']([^"']+)["']/);
if (!m) {
  console.error("check-version: could not find NG_MCP_UI_VERSION in src/version.ts");
  process.exit(1);
}
const constVersion = m[1];

const problems = [];
if (pkgVersion !== constVersion) {
  problems.push(
    `package.json#version (${pkgVersion}) !== NG_MCP_UI_VERSION (${constVersion}) — update src/version.ts`,
  );
}

// Optional tag check for the release workflow: `vX.Y.Z` must match package.json.
const tagFlag = process.argv.indexOf("--tag");
if (tagFlag !== -1) {
  const rawTag = process.argv[tagFlag + 1] ?? "";
  const tagVersion = rawTag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tagVersion)) {
    problems.push(`release tag "${rawTag}" is not a vX.Y.Z semver tag`);
  } else if (tagVersion !== pkgVersion) {
    problems.push(
      `release tag (${rawTag}) !== package.json#version (${pkgVersion}) — bump the package or retag`,
    );
  }
}

if (problems.length) {
  console.error("check-version: FAILED");
  for (const p of problems) {
    console.error(`  • ${p}`);
  }
  process.exit(1);
}

console.log(
  `check-version: OK — ng-mcp-ui@${pkgVersion}` +
    (tagFlag !== -1 ? ` matches tag ${process.argv[tagFlag + 1]}` : ""),
);
