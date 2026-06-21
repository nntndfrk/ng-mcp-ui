// S06: the `/assets/widgets` asset router (PLAN §5.1, §3).
//
// Built view chunks are served by a mountable `express.Router` the consumer
// attaches under `/assets/widgets` *before* the Angular SSR catch-all (PLAN §3):
//
//   app.use("/assets/widgets", createViewAssetRouter({ dir: "dist/widgets/browser" }));
//
// CORS is mandatory, not optional: the widget shell loads the bundle as a
// cross-origin **module script** with `crossorigin`, and the host fetches CSS
// the same way, so every response carries `Access-Control-Allow-Origin: *`
// (PLAN §5.1). Hashed files (`name-<HASH>.<ext>`) are immutable and get a
// one-year `immutable` cache; `index.html` is `no-cache` (the manifest may
// change between builds). We deliberately DON'T advertise serving `index.html`
// at the mount root — the HTML shell comes from `resources/read`, not here.
//
// Dev mode proxies `/assets/widgets/*` to a running `ng serve` widgets
// dev-server using only the node `http` module (no new dependency): we open an
// upstream request, copy method/headers/path, and pipe both directions. Kept
// deliberately minimal — it's a developer-loop convenience, not a hardened
// reverse proxy.

import http from "node:http";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

/** Files whose basename matches `name-<HASH>.<ext>` are content-addressed. */
const HASHED_FILE_RE = /-[A-Z0-9]{6,}\.[a-z0-9]+$/i;

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

/** Minimal content-type table for the file types the widgets build emits. */
const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
}

/** Options for {@link createViewAssetRouter}. */
export type CreateViewAssetRouterOptions =
  | {
      /**
       * Production: absolute or cwd-relative path to the widgets build output
       * directory (the `dist/widgets/browser` folder containing the hashed
       * chunks + `index.html`). Files are served statically with CORS, correct
       * content-types, and immutable caching for hashed filenames.
       */
      dir: string;
      mode?: "production";
    }
  | {
      /**
       * Development: proxy every `/assets/widgets/*` request to the running
       * `ng serve` widgets dev-server at this origin (e.g. `http://localhost:4200`).
       * The dev-server serves unhashed `main.js`/`styles.css` from memory.
       */
      devServerUrl: string;
      mode: "development";
    };

/**
 * Apply the always-on CORS header. Module scripts and `crossorigin` CSS fetches
 * require `Access-Control-Allow-Origin` to succeed cross-origin (PLAN §5.1).
 * `*` is safe: these are public, read-only static assets with no credentials.
 */
function applyCors(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
}

/**
 * Build a mountable Express router serving the widget bundle. Mount under the
 * absolute path the shell references:
 *
 * ```ts
 * app.use("/assets/widgets", createViewAssetRouter({ dir: "dist/widgets/browser" }));
 * // dev:
 * app.use("/assets/widgets", createViewAssetRouter({
 *   mode: "development",
 *   devServerUrl: "http://localhost:4200",
 * }));
 * ```
 */
export function createViewAssetRouter(
  options: CreateViewAssetRouterOptions,
): express.Router {
  const router = express.Router();

  // Preflight: answer OPTIONS for any asset path so cross-origin module/CSS
  // fetches that trigger a preflight don't 404.
  router.options("/*splat", (_req: Request, res: Response) => {
    applyCors(res);
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.status(204).end();
  });

  if (options.mode === "development") {
    router.use(devProxy(options.devServerUrl));
    return router;
  }

  router.use(
    express.static(options.dir, {
      // Don't auto-serve `index.html` for directory requests: the HTML shell
      // comes from `resources/read`, not this router (PLAN §5.1).
      index: false,
      // We own caching/CORS via `setHeaders` below to distinguish hashed
      // (immutable) from unhashed (no-cache) files.
      cacheControl: false,
      setHeaders: (res, filePath) => {
        applyCors(res);

        const base = filePath.split(/[\\/]/).pop() ?? filePath;
        const ext = extOf(base);
        const contentType = CONTENT_TYPES[ext];
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }

        if (base === "index.html") {
          res.setHeader("Cache-Control", NO_CACHE);
        } else if (HASHED_FILE_RE.test(base)) {
          res.setHeader("Cache-Control", IMMUTABLE_CACHE);
        } else {
          // Unhashed asset (e.g. a media file shipped by name) — let the host
          // revalidate rather than cache forever.
          res.setHeader("Cache-Control", NO_CACHE);
        }
      },
    }),
  );

  return router;
}

/**
 * Minimal dev-server reverse proxy using `node:http`. Pipes the incoming
 * request to `devServerUrl` (preserving method, path, query, and headers) and
 * streams the upstream response back. Intentionally bare — no retries, no
 * websocket upgrade, no header rewriting beyond `host`/CORS; it exists purely so
 * the dev shell's absolute `/assets/widgets/*` URLs reach `ng serve`.
 */
function devProxy(devServerUrl: string) {
  const upstream = new URL(devServerUrl);

  return (req: Request, res: Response, next: NextFunction): void => {
    applyCors(res);

    // `req.url` here is relative to the mount point (Express strips the mount
    // path), so it already starts at `/main.js` etc. — exactly what the
    // dev-server serves at its root for the widgets target.
    const proxyReq = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: upstream.host },
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode ?? 502);
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        // Re-assert CORS after copying upstream headers (the dev-server may not
        // set it, and module scripts require it).
        applyCors(res);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", (err) => {
      // Upstream unreachable (dev-server not running) — surface a 502 rather
      // than hanging. `next(err)` would fall through to the host app's error
      // handler; a direct 502 is clearer for the dev loop.
      if (!res.headersSent) {
        res.status(502).json({
          error: `widgets dev-server unreachable at ${devServerUrl}: ${err.message}`,
        });
      } else {
        next(err);
      }
    });

    req.pipe(proxyReq);
  };
}
