import { createHash } from "node:crypto";

/**
 * @internal
 * Map a request URL to the `<hash>.claudemcpcontent.com` domain Claude serves
 * view content from. The hash is the first 32 hex chars of `sha256(url)`.
 *
 * The caller (the `McpServer` class) passes the URL Claude registered as its
 * connector, built as `${serverUrl}${pathname}` — `serverUrl` being the
 * `x-forwarded-host`-aware origin from `resolveServerUrl` (request-context).
 *
 * There is deliberately **no** `x-alpic-forwarded-url` precedence here. The
 * upstream Skybridge reference reads that header because it deploys behind
 * Alpic's hosting edge (which proxies the public connector URL and re-sends it
 * via that header); this library self-hosts / tunnels instead (PLAN §6), so the
 * header is never set — and trusting a client-settable header to seed a CSP
 * domain would be dead weight at best and a spoofing seam at worst.
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
