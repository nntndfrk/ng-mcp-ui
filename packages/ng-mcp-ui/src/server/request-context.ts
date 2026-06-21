/**
 * @internal
 * HTTP request headers as exposed by the MCP transport's `requestInfo`. A value
 * may be a single string, a repeated-header array, or absent.
 */
export type RequestHeaders = Record<string, string | string[] | undefined>;

/**
 * @internal
 * Read a single header value, taking the first entry of a repeated header.
 * Lookup is **case-insensitive** (HTTP header names are): a fast direct hit is
 * tried first, then a case-insensitive scan, so a `Host`/`Origin`-cased key
 * still resolves.
 */
export function readHeader(
  headers: RequestHeaders,
  name: string,
): string | undefined {
  let value = headers[name];
  if (value === undefined) {
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) {
        value = headers[key];
        break;
      }
    }
  }
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Take the first token of a possibly comma-separated proxy header
 * (`x-forwarded-host`/`-proto` accumulate one entry per hop when several
 * proxies are chained).
 */
function firstForwardedToken(value: string): string {
  return value.split(",")[0].trim();
}

/**
 * Loopback-host detection that is port- and IPv6-aware: matches `localhost`,
 * `127.0.0.1`, and `::1` with or without a port (e.g. `localhost`,
 * `localhost:4200`, `[::1]:3000`).
 */
function isLoopbackHost(host: string): boolean {
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

/**
 * @internal
 * Derive the public origin a view's assets and CSP should point at, from the
 * incoming request headers. Resolution priority:
 *
 *   1. `x-forwarded-host` (+ `x-forwarded-proto`, default `https`; first token
 *      of each when proxy-chained) — the dev tunnel / reverse proxy case.
 *   2. `origin` (a literal `"null"`, sent for sandboxed/opaque origins, is
 *      treated as absent).
 *   3. `host` — `http` for loopback hosts, otherwise `https`.
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
    const host = firstForwardedToken(forwardedHost);
    const protoHeader = readHeader(headers, "x-forwarded-proto");
    const proto = protoHeader ? firstForwardedToken(protoHeader) : "https";
    return `${proto}://${host}`;
  }

  const origin = readHeader(headers, "origin");
  if (origin && origin !== "null") {
    return origin;
  }

  const host = readHeader(headers, "host");
  if (host) {
    return `${isLoopbackHost(host) ? "http" : "https"}://${host}`;
  }

  const devPort = options.devPort ?? (process.env.__PORT || "3000");
  return `http://localhost:${devPort}`;
}

/**
 * @internal
 * The CSP `connect-src` origins for a view: the server **origin** (normalized,
 * since CSP source expressions must be origins — any path/query is stripped),
 * plus — outside production — its `ws`/`wss` counterpart so a dev HMR socket is
 * allowed by the view iframe's CSP.
 */
export function resolveConnectDomains(
  serverUrl: string,
  options: { isProduction: boolean },
): string[] {
  const origin = new URL(serverUrl).origin;
  const connectDomains = [origin];
  if (!options.isProduction) {
    const wsUrl = new URL(origin);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    connectDomains.push(wsUrl.origin);
  }
  return connectDomains;
}
