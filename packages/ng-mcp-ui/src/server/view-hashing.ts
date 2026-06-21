import { createHash } from "node:crypto";
import { type RequestHeaders, readHeader } from "./request-context.js";

/**
 * @internal
 * Resolve the request URL whose hash forms a Claude content domain.
 *
 * Precedence (matches the draft `resolveViewRequestContext`):
 *   1. `x-alpic-forwarded-url` — the URL the Alpic proxy received from Claude,
 *      authoritative when present (the in-process URL is the proxied origin,
 *      not the public connector URL Claude registered).
 *   2. `${serverUrl}${pathname}` — reconstructed from the resolved server origin
 *      and the request path otherwise.
 *
 * `headers` is injected (not read from any global), so this stays pure and
 * directly testable. The caller (the `McpServer` class) gates this on a
 * `Claude-User` user-agent — see {@link computeClaudeContentDomain}.
 */
export function resolveClaudeContentUrl(
  headers: RequestHeaders,
  context: { serverUrl: string; pathname: string },
): string {
  return (
    readHeader(headers, "x-alpic-forwarded-url") ??
    `${context.serverUrl}${context.pathname}`
  );
}

/**
 * @internal
 * Map a request URL to the `<hash>.claudemcpcontent.com` domain Claude serves
 * view content from. The hash is the first 32 hex chars of `sha256(url)`.
 *
 * A lone trailing slash is stripped first so the hash matches the connector URL
 * **exactly as registered with Claude** — bare origins are registered without a
 * trailing slash, so `https://x.com/` and `https://x.com` must hash alike.
 */
export function computeClaudeContentDomain(requestUrl: string): string {
  // Strip a single trailing slash (not repeated ones — the registered URL has
  // at most one), so the hash matches Claude's connector registration.
  const url = requestUrl.endsWith("/") ? requestUrl.slice(0, -1) : requestUrl;
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return `${hash}.claudemcpcontent.com`;
}

/**
 * @internal
 * Compute a content-derived `?v=` cache-busting param for view URIs so hosts
 * (e.g. ChatGPT) refetch assets when a deploy changes the bundle.
 *
 * S04 simplification: the manifest reduces to `{ mainFile, styleFile }`
 * (PLAN §5.1) — all views share one bundle — so we hash `mainFile` + `styleFile`
 * rather than a per-view chunk filename. The first 8 hex chars of
 * `sha256(mainFile + "\0" + styleFile)` are enough to distinguish builds.
 *
 * Returns `""`:
 *   - outside production (dev/test serve unhashed, ever-changing assets), or
 *   - when the manifest can't resolve `mainFile` (passed as `undefined`).
 *
 * Filenames are injected rather than read from a manifest object, keeping this
 * pure; the caller resolves them and passes `undefined` on failure.
 */
export function computeViewVersionParam(
  files: { mainFile: string | undefined; styleFile?: string | null },
  options: { isProduction: boolean },
): string {
  if (!options.isProduction || !files.mainFile) {
    return "";
  }
  const hash = createHash("sha256")
    .update(files.mainFile)
    .update("\0")
    .update(files.styleFile ?? "")
    .digest("hex")
    .slice(0, 8);
  return `?v=${hash}`;
}
