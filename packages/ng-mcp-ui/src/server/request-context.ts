/**
 * @internal
 * HTTP request headers as exposed by the MCP transport's `requestInfo`. A value
 * may be a single string, a repeated-header array, or absent.
 */
export type RequestHeaders = Record<string, string | string[] | undefined>;

/**
 * @internal
 * Read a single header value, taking the first entry of a repeated header.
 */
export function readHeader(
  headers: RequestHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * @internal
 * Derive the public origin a view's assets and CSP should point at, from the
 * incoming request headers. Resolution priority:
 *
 *   1. `x-forwarded-host` (+ `x-forwarded-proto`, default `https`) — the dev
 *      tunnel / reverse proxy case.
 *   2. `origin`.
 *   3. `host` — `http` for `localhost:`/`127.0.0.1:`, otherwise `https`.
 *   4. `http://localhost:${devPort}` — dev fallback; `devPort` defaults to
 *      `process.env.__PORT` or `"3000"`.
 *
 * `devPort` is injectable so the fallback can be tested without touching the
 * environment.
 */
export function resolveServerUrl(
  headers: RequestHeaders,
  options: { devPort?: string } = {},
): string {
  const forwardedHost = readHeader(headers, "x-forwarded-host");
  if (forwardedHost) {
    const proto = readHeader(headers, "x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost}`;
  }

  const origin = readHeader(headers, "origin");
  if (origin) {
    return origin;
  }

  const host = readHeader(headers, "host");
  if (host) {
    const isLocal = ["127.0.0.1:", "localhost:"].some((p) =>
      host.startsWith(p),
    );
    return `${isLocal ? "http" : "https"}://${host}`;
  }

  const devPort = options.devPort ?? (process.env.__PORT || "3000");
  return `http://localhost:${devPort}`;
}

/**
 * @internal
 * The CSP `connect-src` origins for a view: always the server origin itself,
 * plus — outside production — its `ws`/`wss` counterpart, so a dev HMR socket is
 * allowed by the view iframe's CSP.
 */
export function resolveConnectDomains(
  serverUrl: string,
  options: { isProduction: boolean },
): string[] {
  const connectDomains = [serverUrl];
  if (!options.isProduction) {
    const wsUrl = new URL(serverUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    connectDomains.push(wsUrl.origin);
  }
  return connectDomains;
}
