/**
 * Package version, re-exported from every entry point. Must stay in sync with
 * `package.json#version`; `tools/check-version.mjs` enforces this in CI and gates
 * the release workflow, so a drifted constant fails the build rather than shipping.
 */
export const NG_MCP_UI_VERSION = "0.1.0";
