/** Constants shared by the landing page, the header, and the footer. */

export const REPO_URL = "https://github.com/nntndfrk/ng-mcp-ui";
export const NPM_URL = "https://www.npmjs.com/package/ng-mcp-ui";

/**
 * The 1.x line's documentation. It is a separate build of this site, nested
 * under /next/ by the docs workflow, so it is an absolute link rather than a
 * router route. This site covers 0.2.x (npm `latest`); 1.x speaks the MCP
 * 2026-07-28 revision only and ships on the npm `next` dist-tag.
 */
export const NEXT_DOCS_URL = "https://nntndfrk.github.io/ng-mcp-ui/next/";

/** Injected at build time from packages/ng-mcp-ui/package.json — never hand-edited. */
export const LIBRARY_VERSION = import.meta.env.NG_MCP_UI_VERSION;

/** First page of the docs; the header "Docs" link and /docs both land here. */
export const DOCS_ENTRY_ROUTE = "/docs/getting-started/introduction";
