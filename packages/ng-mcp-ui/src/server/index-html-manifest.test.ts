// Tests for `IndexHtmlViewManifest` (S06, PLAN §5.1). The `SPIKE_INDEX_HTML`
// constant below is copied VERBATIM from the real Angular 22 widgets build
// output at `spike/dist/widgets/browser/index.html` — the parser must handle it
// exactly (bare hashed `main-*.js` in <body>, `modulepreload` chunk links that
// MUST be ignored, `data-beasties-container` attr, no stylesheet link because
// beasties inlined the CSS).

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IndexHtmlViewManifest,
  ViewManifestError,
} from "./index-html-manifest.js";

// Verbatim spike output.
const SPIKE_INDEX_HTML = `<!doctype html>
<html data-beasties-container>
<head><meta charset="utf-8"><title>widgets</title></head>
<body><div id="root"></div><link rel="modulepreload" href="chunk-YA22Z7VT.js"><link rel="modulepreload" href="chunk-ZNJYLT2K.js"><script src="main-XBYE53NT.js" type="module"></script></body>
</html>
`;

// A variant that DOES emit a hashed global stylesheet (beasties disabled).
const INDEX_WITH_STYLES = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="stylesheet" href="styles-3KHXIMM7.css"></head>
<body><div id="root"></div><script src="main-XBYE53NT.js" type="module"></script></body>
</html>
`;

describe("IndexHtmlViewManifest (html string)", () => {
  it("parses the verbatim spike output: main-XBYE53NT.js, no stylesheet", () => {
    const m = new IndexHtmlViewManifest({ html: SPIKE_INDEX_HTML });
    expect(m.mainFile()).toBe("main-XBYE53NT.js");
    expect(m.styleFile()).toBeUndefined();
  });

  it("ignores modulepreload chunk links (does not mistake them for main)", () => {
    const m = new IndexHtmlViewManifest({ html: SPIKE_INDEX_HTML });
    expect(m.mainFile()).not.toContain("chunk-");
  });

  it("parses a hashed stylesheet when present", () => {
    const m = new IndexHtmlViewManifest({ html: INDEX_WITH_STYLES });
    expect(m.mainFile()).toBe("main-XBYE53NT.js");
    expect(m.styleFile()).toBe("styles-3KHXIMM7.css");
  });

  it("parses unhashed dev names (main.js / styles.css)", () => {
    const html =
      '<html><head><link rel="stylesheet" href="styles.css"></head>' +
      '<body><script src="main.js" type="module"></script></body></html>';
    const m = new IndexHtmlViewManifest({ html });
    expect(m.mainFile()).toBe("main.js");
    expect(m.styleFile()).toBe("styles.css");
  });

  it("throws a named ViewManifestError when no main script is found", () => {
    const html = '<html><body><div id="root"></div></body></html>';
    expect(() => new IndexHtmlViewManifest({ html })).toThrow(ViewManifestError);
    try {
      // eslint-disable-next-line no-new
      new IndexHtmlViewManifest({ html });
    } catch (err) {
      expect((err as Error).name).toBe("ViewManifestError");
      // Message lists what was searched.
      expect((err as Error).message).toContain("main-*.js");
    }
  });

  it("does not treat a non-module main script as the entry", () => {
    // A classic (non-module) script must not match — Angular emits type=module.
    const html =
      '<html><body><script src="main-AAA.js"></script></body></html>';
    expect(() => new IndexHtmlViewManifest({ html })).toThrow(ViewManifestError);
  });
});

describe("IndexHtmlViewManifest (file path)", () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lazily reads the file, caches, and reload() re-reads", () => {
    dir = mkdtempSync(join(tmpdir(), "ng-mcp-ui-manifest-"));
    const file = join(dir, "index.html");
    writeFileSync(file, SPIKE_INDEX_HTML, "utf8");

    const m = new IndexHtmlViewManifest({ path: file });
    expect(m.mainFile()).toBe("main-XBYE53NT.js");

    // Rewrite the file; without reload() the cached value persists.
    writeFileSync(
      file,
      '<html><body><script src="main-NEW123.js" type="module"></script></body></html>',
      "utf8",
    );
    expect(m.mainFile()).toBe("main-XBYE53NT.js");

    // reload() clears the cache → next access re-reads.
    m.reload();
    expect(m.mainFile()).toBe("main-NEW123.js");
  });

  it("throws ViewManifestError for a missing file", () => {
    const m = new IndexHtmlViewManifest({
      path: "/definitely/not/here/index.html",
    });
    expect(() => m.mainFile()).toThrow(ViewManifestError);
  });
});
