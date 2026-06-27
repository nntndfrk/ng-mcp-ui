/**
 * Path segment between the server origin and a relative asset path. Widget
 * assets are served under `/assets/widgets/` (PLAN §5.4/§5.5, matching the
 * shell's `{{serverUrl}}/assets/widgets/...` convention and the
 * `createViewAssetRouter()` mount at `/assets/widgets`).
 */
export const ASSET_PREFIX = "/assets/widgets/";

/**
 * Framework-free core of {@link McpAssetPipe}: resolve a relative asset path to
 * an absolute URL on the MCP server origin. Kept decorator-free so it (and its
 * tests) compile under the root Vitest/esbuild transform, which cannot handle
 * Angular decorators (the same constraint that keeps `mcp-modal.ts`
 * function-based).
 *
 * This is the v1 fix for the cross-origin asset hazard (PLAN §5.5): inside the
 * host iframe `document.baseURI` is the opaque host origin, so a bare
 * `src="poll.png"` (or a component-style `url(...)`) resolves against the wrong
 * origin. Rewriting against the injected server URL — the app's own server —
 * fixes the resolution at runtime instead of at build time.
 *
 * Output: `${serverUrl}/assets/widgets/${path}` (a single slash between
 * segments; a trailing `/` on `serverUrl` and a leading `/` on `path` are
 * tolerated). When `serverUrl` is empty — dev, where the shell injects no origin
 * and `document.baseURI` is already correct — the relative `path` is returned
 * unchanged.
 */
export function resolveMcpAsset(serverUrl: string, path: string): string {
  // Dev: no injected origin and baseURI is already the dev server — leave the
  // relative path untouched so it resolves naturally.
  if (!serverUrl) {
    return path;
  }

  const origin = serverUrl.replace(/\/+$/, "");
  const rel = path.replace(/^\/+/, "");
  return `${origin}${ASSET_PREFIX}${rel}`;
}
