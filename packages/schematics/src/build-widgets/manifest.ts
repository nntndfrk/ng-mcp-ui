// WIDGETS MANIFEST VALIDATION — the post-build half of the
// `ng-mcp-ui:build-widgets` builder (issue #48). After the wrapped
// `@angular/build:application` run, this module derives a views manifest from
// the real emitted bundle graph and FAILS LOUDLY if any registered view has no
// emitted code-split chunk on disk:
//
//   1. Parse `<browserOutDir>/index.html` for the hashed entry `main-*.js`
//      and, if present, the `styles-*.css`.
//   2. Load the list of registered view names from the registry source
//      (`registry = { ... } as const`).
//   3. For EACH view, find the relative lazy `import("./<view>.widget-*.js")`
//      inside the entry bundle (the registry's `() => import(...)` after
//      esbuild code-split) and resolve that chunk on disk.
//
// This logic previously lived in an `ng add`-scaffolded `tools/build-widgets.mjs`
// copied into every app; it moved here so the chunk-naming / hash-charset /
// registry-shape couplings are internal library details that evolve with the
// library instead of drifting in stale per-app copies.
//
// Why derive from the emitted FILES rather than "the build result through the
// builder API" (issue #48's sketch): the delegation runs via
// `context.scheduleBuilder`, whose contract is only `BuilderOutput`
// ({ success }) — `@angular/build` exposes its per-file bundle graph (the
// `Result` API) solely through `buildApplicationInternal`, which is explicitly
// internal/experimental. Reading the output dir keeps us on public API; the
// couplings below are the cost, and they are now versioned WITH the library.
//
// The hash regexes are base64url-aware (`[A-Za-z0-9_-]`), matching the
// `outputHashing: all` build setting.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Named error so a view missing its emitted chunk is unambiguous in CI output. */
export class WidgetsManifestError extends Error {
  override name = "WidgetsManifestError";
}

/** The derived manifest: hashed entry + styles basenames and per-view chunks. */
export interface WidgetsManifest {
  entry: string;
  styles: string | null;
  views: Record<string, string>;
}

export interface ValidateWidgetsOutputOptions {
  /** Absolute path to the emitted browser output dir (`.../browser`). */
  browserOutDir: string;
  /** Absolute path to the widget registry source (`registry.ts`). */
  registryPath: string;
}

export interface WidgetsValidationResult {
  manifest: WidgetsManifest;
  /** Registered views with no resolvable emitted chunk (empty on success). */
  missing: string[];
}

/**
 * Derive the absolute browser output dir from the application builder's
 * `outputPath` option, which is either a string base or an object with a
 * `base` and optional `browser` subdir (defaulting to `browser`).
 */
export function resolveBrowserOutDir(
  workspaceRoot: string,
  outputPath: unknown,
): string {
  if (typeof outputPath === "string" && outputPath.length > 0) {
    return resolve(workspaceRoot, outputPath, "browser");
  }
  if (
    typeof outputPath === "object" &&
    outputPath !== null &&
    typeof (outputPath as { base?: unknown }).base === "string"
  ) {
    const { base, browser } = outputPath as { base: string; browser?: unknown };
    // `browser: ""` is the documented way to emit directly into `base`.
    const sub = typeof browser === "string" ? browser : "browser";
    return sub ? resolve(workspaceRoot, base, sub) : resolve(workspaceRoot, base);
  }
  throw new WidgetsManifestError(
    "the `build-widgets` target needs an explicit `outputPath` option " +
      '(e.g. "dist/widgets") so the emitted bundle graph can be validated.',
  );
}

/**
 * Read the registry's view-name list.
 *
 * Design choice: we parse the registry as TEXT rather than importing it. The
 * registry is a `.ts` source with a runtime `import("./echo/echo.widget")` body;
 * importing it from the builder would require a TS loader AND would try to
 * resolve the widget modules, which is the wrong layer for a build-graph check.
 * The file is a flat object literal — `viewName: () => import(...)` — so
 * extracting the top-level object keys is small and robust. We scope the scan to
 * the `registry = { ... }` literal body to avoid matching the `ViewName` type
 * alias or comments.
 */
export function loadRegistryViewNames(registryPath: string): string[] {
  if (!existsSync(registryPath)) {
    throw new WidgetsManifestError(`registry not found at ${registryPath}`);
  }
  const src = readFileSync(registryPath, "utf8");
  const literal = src.match(/registry\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!literal) {
    throw new WidgetsManifestError(
      `could not locate the \`registry = { ... } as const\` object literal in ${registryPath}`,
    );
  }
  // Match each entry key: an identifier (or quoted key) immediately followed by
  // a colon and an arrow-function lazy import. This skips line comments.
  const body = literal[1];
  const names: string[] = [];
  const entry =
    /(?:^|[,{\n])\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*\(\s*\)\s*=>/g;
  let m = entry.exec(body);
  while (m !== null) {
    names.push(m[1] ?? m[2] ?? m[3]);
    m = entry.exec(body);
  }
  if (names.length === 0) {
    throw new WidgetsManifestError(
      `no view entries found in the registry literal in ${registryPath}`,
    );
  }
  return names;
}

/** Pull the hashed entry `main-*.js` basename out of the built index.html. */
function parseEntry(indexHtml: string, indexHtmlPath: string): string {
  const m = indexHtml.match(
    /<script\b[^>]*\bsrc="(main(?:-[A-Za-z0-9_-]+)?\.js)"[^>]*>/i,
  );
  if (!m) {
    throw new WidgetsManifestError(
      `could not find the hashed \`main-*.js\` entry script in ${indexHtmlPath}`,
    );
  }
  return m[1];
}

/** Pull the hashed `styles-*.css` basename out of index.html, if any. */
function parseStyles(indexHtml: string): string | null {
  const m = indexHtml.match(
    /<link\b[^>]*\bhref="(styles(?:-[A-Za-z0-9_-]+)?\.css)"[^>]*>/i,
  );
  return m ? m[1] : null;
}

/**
 * Find the relative lazy `import("./<view>.widget-*.js")` for one view inside the
 * entry bundle — the registry's `() => import("./<view>/<view>.widget")` after
 * esbuild code-split. Returns the chunk basename, or null if not present.
 */
function findViewChunk(mainJs: string, view: string): string | null {
  // View name may contain regex metachars in theory; escape it defensively.
  const safe = view.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Accept any of the three JS quote styles and require the pair to match:
  // Angular 22's esbuild minifies dynamic imports to template literals
  // (import(`./x.widget-HASH.js`)) where v20/v21 emitted double quotes.
  const re = new RegExp(
    `import\\(\\s*(["'\`])(\\.\\/${safe}\\.widget-[A-Za-z0-9_-]+\\.js)\\1\\s*\\)`,
  );
  const m = mainJs.match(re);
  return m ? basename(m[2]) : null;
}

/**
 * Walk the lazy-import chain for EVERY registered view against the emitted
 * output. Returns the derived manifest plus the list of views that resolved to
 * no chunk on disk; the caller decides whether missing views fail the build.
 */
export function validateWidgetsOutput(
  options: ValidateWidgetsOutputOptions,
): WidgetsValidationResult {
  const { browserOutDir, registryPath } = options;
  const indexHtmlPath = join(browserOutDir, "index.html");
  if (!existsSync(indexHtmlPath)) {
    throw new WidgetsManifestError(
      `widgets build did not emit ${indexHtmlPath}. Is \`index\` set on the build-widgets target?`,
    );
  }

  const indexHtml = readFileSync(indexHtmlPath, "utf8");
  const entry = parseEntry(indexHtml, indexHtmlPath);
  const styles = parseStyles(indexHtml);

  const entryPath = join(browserOutDir, entry);
  if (!existsSync(entryPath)) {
    throw new WidgetsManifestError(`entry bundle missing on disk: ${entryPath}`);
  }
  const mainJs = readFileSync(entryPath, "utf8");

  const views = loadRegistryViewNames(registryPath);
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const view of views) {
    const chunk = findViewChunk(mainJs, view);
    if (chunk === null || !existsSync(join(browserOutDir, chunk))) {
      missing.push(view);
      continue;
    }
    resolved[view] = chunk;
  }

  return { manifest: { entry, styles, views: resolved }, missing };
}

/** The actionable message for views whose chunk never made it to disk. */
export function missingViewsMessage(missing: string[]): string {
  return (
    `registered view(s) with no emitted widget chunk: ${missing.join(", ")}. ` +
    "Each registry view must code-split into a relative " +
    '`import("./<view>.widget-*.js")` chunk in the widgets output. ' +
    "Check that the view's widget module exists and is reachable from " +
    "the widgets entry point (src/widgets/main.ts)."
  );
}

/** Emit the manifest JSON (creating parent dirs as needed). */
export function writeManifest(
  manifestPath: string,
  manifest: WidgetsManifest,
): void {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
