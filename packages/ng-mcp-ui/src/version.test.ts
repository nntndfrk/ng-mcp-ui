import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NG_MCP_UI_VERSION as server } from "./server/index.js";
import { NG_MCP_UI_VERSION as testing } from "./testing/index.js";
import { NG_MCP_UI_VERSION as tunnel } from "./tunnel/index.js";
import { NG_MCP_UI_VERSION as web } from "./web/index.js";
import { NG_MCP_UI_VERSION } from "./version.js";

// Source-of-truth for the expected value: package.json, read at test time so a
// version bump can't drift the exported constant past this guard (the release
// `check:version` gate enforces the same equality outside the test run).
const pkgVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

// Smoke test: every public subpath entry is importable and re-exports the single
// source-of-truth version, and that version matches package.json.
test("every subpath entry re-exports the package version", () => {
  expect(NG_MCP_UI_VERSION).toBe(pkgVersion);
  expect(server).toBe(NG_MCP_UI_VERSION);
  expect(web).toBe(NG_MCP_UI_VERSION);
  expect(testing).toBe(NG_MCP_UI_VERSION);
  expect(tunnel).toBe(NG_MCP_UI_VERSION);
});
