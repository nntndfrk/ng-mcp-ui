// S06: the real {@link ViewManifest} — parses the Angular widgets build's
// emitted `dist/widgets/browser/index.html` (PLAN §5.1).
//
// There is no Vite-style `manifest.json` to read, but
// `@angular/build:application` writes an `index.html` that references the hashed
// entry bundle (and, when not inlined, a global stylesheet). The spike verified
// that inter-chunk imports are relative, so the server only needs the single
// entry `main-*.js` plus the optional `styles-*.css` — everything else resolves
// against `main`'s URL automatically.
//
// We parse with regexes (no DOM dependency). The real spike output is a single
// minified line in `<body>`:
//
//   <script src="main-XBYE53NT.js" type="module"></script>
//
// preceded by `<link rel="modulepreload" href="chunk-*.js">` tags that MUST be
// ignored — only the entry `<script>` and a `rel="stylesheet"` `<link>` count.
// The `<html data-beasties-container>` attribute (beasties inlined the critical
// CSS, so there is NO stylesheet link) is handled by `styleFile()` returning
// `undefined`.

import { readFileSync } from "node:fs";
import type { ViewManifest } from "./view-manifest.js";

/**
 * Thrown when {@link IndexHtmlViewManifest} cannot find the entry `main-*.js`
 * script in the parsed `index.html`. Names what was searched so a
 * misconfigured build path / unexpected build output is debuggable.
 */
export class ViewManifestError extends Error {
  override readonly name = "ViewManifestError";
}

/** Parsed result: the entry bundle, and the optional global stylesheet. */
interface ParsedManifest {
  main: string;
  style: string | undefined;
}

/**
 * Match the entry `<script src="main-….js" type="module">`. The src and type
 * attributes appear in either order in real builds, so we match a `<script>`
 * whose `src` starts with `main-` (or is exactly `main.js`) and whose tag also
 * carries `type="module"`. `modulepreload` `<link>` tags don't match — they're
 * `<link>`, not `<script>`.
 */
const SCRIPT_TAG_RE = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi;

/**
 * Match a `<link rel="stylesheet" href="styles-….css">`. `rel` and `href`
 * appear in either order, so this matches any `<link>` tag carrying both a
 * `rel="stylesheet"` and an `href`. `modulepreload` links don't match because
 * their `rel` is `modulepreload`, not `stylesheet`.
 */
const LINK_TAG_RE = /<link\b([^>]*)>/gi;

/** Extract an attribute value from a tag's attribute string. */
function attr(tagAttrs: string, name: string): string | undefined {
  const m = tagAttrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m?.[1];
}

/**
 * Parse the entry main script and the optional global stylesheet out of an
 * Angular widgets-build `index.html` string.
 *
 * Selection rules:
 * - main: the `<script>` whose `src` basename starts with `main-` (hashed) or is
 *   exactly `main.js` (dev), AND carries `type="module"`. A bare hashed
 *   `main-XBYE53NT.js` is the spike's real output.
 * - style: the first `<link rel="stylesheet">` whose `href` basename starts with
 *   `styles` and ends in `.css`. Absent when beasties inlined the CSS
 *   (`data-beasties-container`) — then `style` is `undefined`.
 * - `modulepreload` `<link href="chunk-*.js">` tags are ignored.
 */
function parseIndexHtml(html: string): ParsedManifest {
  let main: string | undefined;

  SCRIPT_TAG_RE.lastIndex = 0;
  for (let m = SCRIPT_TAG_RE.exec(html); m; m = SCRIPT_TAG_RE.exec(html)) {
    const fullTag = m[0];
    const src = m[1];
    if (!/\btype="module"/i.test(fullTag)) {
      continue;
    }
    const base = src.split("/").pop() ?? src;
    if (/^main(-[^/]*)?\.js$/i.test(base)) {
      main = src;
      break;
    }
  }

  if (!main) {
    throw new ViewManifestError(
      "ng-mcp-ui: could not resolve the widget entry bundle from index.html. " +
        'Searched for a `<script type="module" src="main-*.js">` (hashed) or ' +
        "`main.js` (dev) tag and found none. Check that the widgets build " +
        "emitted `dist/widgets/browser/index.html` with a module entry script.",
    );
  }

  let style: string | undefined;
  LINK_TAG_RE.lastIndex = 0;
  for (let m = LINK_TAG_RE.exec(html); m; m = LINK_TAG_RE.exec(html)) {
    const tagAttrs = m[1];
    if (attr(tagAttrs, "rel")?.toLowerCase() !== "stylesheet") {
      continue;
    }
    const href = attr(tagAttrs, "href");
    if (!href) {
      continue;
    }
    const base = href.split("/").pop() ?? href;
    if (/^styles(-[^/]*)?\.css$/i.test(base)) {
      style = href;
      break;
    }
  }

  return { main, style };
}

/**
 * {@link ViewManifest} backed by an Angular widgets-build `index.html`.
 *
 * Construct with EITHER an inline HTML string (parsed eagerly) or a filesystem
 * path (read lazily on first access, then cached). {@link reload} clears the
 * cache so the next access re-reads the file — useful when the build re-runs
 * while the server is up.
 *
 * @example
 * // From a file path (lazy read + cache):
 * new IndexHtmlViewManifest({ path: "dist/widgets/browser/index.html" });
 * // From an inline string (eager parse — tests / embedded builds):
 * new IndexHtmlViewManifest({ html: "<!doctype html>…" });
 */
export class IndexHtmlViewManifest implements ViewManifest {
  private readonly path: string | undefined;
  private parsed: ParsedManifest | undefined;

  constructor(source: { path: string } | { html: string }) {
    if ("html" in source) {
      this.path = undefined;
      this.parsed = parseIndexHtml(source.html);
    } else {
      this.path = source.path;
      this.parsed = undefined;
    }
  }

  /** Lazily read + parse + cache (for the path form); returns the cache otherwise. */
  private resolve(): ParsedManifest {
    if (this.parsed) {
      return this.parsed;
    }
    // `path` is always set when `parsed` is unset (constructor invariant).
    const path = this.path as string;
    let html: string;
    try {
      html = readFileSync(path, "utf8");
    } catch (cause) {
      throw new ViewManifestError(
        `ng-mcp-ui: failed to read widgets index.html at "${path}". ` +
          "Run the widgets build first, or point IndexHtmlViewManifest at the " +
          "correct `dist/widgets/browser/index.html`.",
        // `cause` aids debugging the underlying fs error (ENOENT, EACCES, …).
        { cause },
      );
    }
    this.parsed = parseIndexHtml(html);
    return this.parsed;
  }

  /** Clear the cache so the next access re-reads the source file (path form). */
  reload(): void {
    if (this.path !== undefined) {
      this.parsed = undefined;
    }
  }

  mainFile(): string {
    return this.resolve().main;
  }

  styleFile(): string | undefined {
    return this.resolve().style;
  }
}
