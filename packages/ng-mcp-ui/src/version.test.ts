import { expect, test } from "vitest";
import { NG_MCP_UI_VERSION as server } from "./server/index.js";
import { NG_MCP_UI_VERSION as testing } from "./testing/index.js";
import { NG_MCP_UI_VERSION as tunnel } from "./tunnel/index.js";
import { NG_MCP_UI_VERSION as web } from "./web/index.js";
import { NG_MCP_UI_VERSION } from "./version.js";

// Smoke test: every public subpath entry is importable and re-exports the single
// source-of-truth version. Proves the four barrels + exports wiring before any
// real surface lands.
test("every subpath entry re-exports the package version", () => {
  expect(NG_MCP_UI_VERSION).toBe("0.0.0");
  expect(server).toBe(NG_MCP_UI_VERSION);
  expect(web).toBe(NG_MCP_UI_VERSION);
  expect(testing).toBe(NG_MCP_UI_VERSION);
  expect(tunnel).toBe(NG_MCP_UI_VERSION);
});
