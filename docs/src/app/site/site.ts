/** Constants shared by the landing page, the header, and the footer. */

export const REPO_URL = "https://github.com/nntndfrk/ng-mcp-ui";
export const NPM_URL = "https://www.npmjs.com/package/ng-mcp-ui";

/**
 * The 0.2.x line's documentation. This build is the 1.x one, which the docs
 * workflow nests under /next/ on the same Pages site, so the stable docs are an
 * absolute link out of this subpath rather than a router route. 1.x speaks the
 * MCP 2026-07-28 revision only and ships on the npm `next` dist-tag; 0.2.x is
 * npm `latest` and the line today's hosts connect to.
 */
export const STABLE_DOCS_URL = "https://nntndfrk.github.io/ng-mcp-ui/";

/** Injected at build time from packages/ng-mcp-ui/package.json — never hand-edited. */
export const LIBRARY_VERSION = import.meta.env.NG_MCP_UI_VERSION;

/** First page of the docs; the header "Docs" link and /docs both land here. */
export const DOCS_ENTRY_ROUTE = "/docs/getting-started/introduction";
