// S06: the real Angular widget HTML shells (PLAN §5.3).
//
// The resource HTML is rendered without Handlebars (intentionally NOT a
// dependency here) and the shell boots an **Angular** widget bundle rather than a
// React entry, so the production/development templates are plain
// template-literal functions per PLAN §5.3. The contract shape is a
// `window.mcpUi` global, a `#root` mount, and an absolute `main`/`styles`
// reference; the global carries `viewName` and assets are served from
// `/assets/widgets/`.
//
// All interpolated values are HTML-escaped before they reach markup. `serverUrl`
// and `viewName` originate from request headers / view config, so escaping is a
// defense-in-depth measure even though the values are normally trusted.

import type {
  ShellRenderer,
  ShellRenderInput,
} from "./shell-renderer.js";
import type { ViewHostType } from "./types.js";
import type { ViewManifest } from "./view-manifest.js";

/** The shell mode. `development` loads the unhashed dev-server bundle. */
export type ShellMode = "production" | "development";

/**
 * Escape a string for safe interpolation into HTML text/attribute context.
 * Covers the five characters that can break out of an attribute value or text
 * node (`&`, `<`, `>`, `"`, `'`). `&` is replaced first so the other entities
 * aren't double-escaped.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize a single string value as a JS string literal safe to embed in a
 * `<script>`. `JSON.stringify` handles quoting/escaping of `"`, backslashes, and
 * control chars; we additionally rewrite every `<` into its equivalent JS
 * unicode escape (so the literal characters `</script>` can never appear in the
 * output and close the enclosing `<script>` element — the classic injection
 * guard). The escaped form is still the same string when the browser parses it.
 */
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The `window.mcpUi` global, emitted as a readable object literal inside a
 * `<script type="module">` — matching the PLAN §5.3 contract shape
 * `{ hostType: "…", serverUrl: "…", viewName: "…" }`. Each value is encoded via
 * {@link jsString} so attacker-controlled `serverUrl`/`viewName` can't break out
 * of the literal or the script element.
 */
function mcpUiGlobalScript(input: {
  hostType: ViewHostType;
  serverUrl: string;
  viewName: string;
}): string {
  const literal = `{ hostType: ${jsString(input.hostType)}, serverUrl: ${jsString(
    input.serverUrl,
  )}, viewName: ${jsString(input.viewName)} }`;
  return `<script type="module">window.mcpUi = ${literal};</script>`;
}

/**
 * Production shell. Loads the hashed bundle filenames resolved from the
 * {@link ViewManifest}. The `<link rel=stylesheet>` is OMITTED when the build
 * emitted no global stylesheet (`styleFile()` returns `undefined` — e.g. when
 * beasties inlines critical CSS). Assets carry `crossorigin` because the host
 * fetches them cross-origin under a CORS-gated module-script policy (PLAN §5.1).
 */
export function renderProductionShell(input: {
  hostType: ViewHostType;
  serverUrl: string;
  viewName: string;
  manifest: ViewManifest;
}): string {
  const serverUrl = escapeHtml(input.serverUrl);
  const mainFile = escapeHtml(input.manifest.mainFile());
  const rawStyleFile = input.manifest.styleFile();
  const styleTag = rawStyleFile
    ? `\n    <link rel="stylesheet" crossorigin href="${serverUrl}/assets/widgets/${escapeHtml(
        rawStyleFile,
      )}" />`
    : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    `    ${mcpUiGlobalScript(input)}${styleTag}`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    `    <script type="module" crossorigin src="${serverUrl}/assets/widgets/${mainFile}"></script>`,
    "  </body>",
    "</html>",
  ].join("\n");
}

/**
 * Development shell. The widgets `ng serve` dev-server serves **unhashed**
 * `main.js` (+ `styles.css`) from memory, so this template hardcodes those
 * names and consults no manifest (PLAN §5.3). `server.ts` proxies
 * `/assets/widgets/*` to the dev-server port (see {@link createViewAssetRouter}
 * dev mode), so the shell still references the same absolute `serverUrl` path —
 * the proxy is transparent to the host.
 */
export function renderDevelopmentShell(input: {
  hostType: ViewHostType;
  serverUrl: string;
  viewName: string;
}): string {
  const serverUrl = escapeHtml(input.serverUrl);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    `    ${mcpUiGlobalScript(input)}`,
    `    <link rel="stylesheet" crossorigin href="${serverUrl}/assets/widgets/styles.css" />`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    `    <script type="module" crossorigin src="${serverUrl}/assets/widgets/main.js"></script>`,
    "  </body>",
    "</html>",
  ].join("\n");
}

/**
 * The real {@link ShellRenderer} for the Angular widgets target. Constructed
 * with a {@link ShellMode} and a {@link ViewManifest}; renders the production or
 * development shell per the mode. The `isProduction` flag on the per-request
 * {@link ShellRenderInput} is honored as an override of the constructed mode so
 * a single renderer instance can follow `NODE_ENV` if the caller threads it
 * through (the server passes `process.env.NODE_ENV === "production"`); when the
 * input omits a meaningful flag the constructed mode wins.
 */
export class AngularShellRenderer implements ShellRenderer {
  constructor(
    private readonly mode: ShellMode,
    private readonly manifest: ViewManifest,
  ) {}

  render(input: ShellRenderInput): string {
    // The server passes the request-time production flag; prefer it so one
    // renderer instance stays correct even if `NODE_ENV` differs from the mode
    // it was constructed with. Falls back to the constructed mode otherwise.
    const isProduction = input.isProduction ?? this.mode === "production";
    const manifest = input.manifest ?? this.manifest;

    if (isProduction) {
      return renderProductionShell({
        hostType: input.hostType,
        serverUrl: input.serverUrl,
        viewName: input.viewName,
        manifest,
      });
    }
    return renderDevelopmentShell({
      hostType: input.hostType,
      serverUrl: input.serverUrl,
      viewName: input.viewName,
    });
  }
}
