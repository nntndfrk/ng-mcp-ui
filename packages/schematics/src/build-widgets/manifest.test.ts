import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WidgetsManifestError,
  loadRegistryViewNames,
  resolveBrowserOutDir,
  validateWidgetsOutput,
  writeManifest,
} from "./manifest";

// Disk-fixture harness: the validator reads REAL emitted-output shapes
// (index.html + hashed entry + code-split chunks), so each test lays the files
// out in a temp dir exactly as `@angular/build:application` would.

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ng-mcp-ui-manifest-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const REGISTRY = `
// A widget registry as scaffolded by ng add / ng generate ng-mcp-ui:view.
export const registry = {
  echo: () => import("./echo/echo.widget"),
  "quick-poll": () => import("./quick-poll/quick-poll.widget"),
} as const;
export type ViewName = keyof typeof registry;
`;

function writeRegistry(content = REGISTRY): string {
  const path = join(dir, "registry.ts");
  writeFileSync(path, content, "utf8");
  return path;
}

/** Lay out a browser output dir the way outputHashing:all emits it. */
function writeBrowserOut(opts: {
  styles?: boolean;
  views?: Record<string, { imported?: boolean; onDisk?: boolean }>;
  /** Quote style the minifier used for the lazy import; varies by major. */
  quote?: '"' | "'" | "`";
}): string {
  const out = join(dir, "dist", "widgets", "browser");
  mkdirSync(out, { recursive: true });
  const views = opts.views ?? {};
  const q = opts.quote ?? '"';

  const imports = Object.entries(views)
    .filter(([, v]) => v.imported !== false)
    .map(([name]) => `import(${q}./${name}.widget-B64_urlHash.js${q})`)
    .join(";");
  writeFileSync(join(out, "main-ABC123_-.js"), `${imports};\n`, "utf8");

  for (const [name, v] of Object.entries(views)) {
    if (v.onDisk !== false) {
      writeFileSync(join(out, `${name}.widget-B64_urlHash.js`), "export{};\n");
    }
  }

  const stylesTag = opts.styles
    ? '<link rel="stylesheet" href="styles-XYZ789.css">'
    : "";
  if (opts.styles) {
    writeFileSync(join(out, "styles-XYZ789.css"), "", "utf8");
  }
  writeFileSync(
    join(out, "index.html"),
    `<!doctype html><html><head>${stylesTag}</head><body><script src="main-ABC123_-.js" type="module"></script></body></html>`,
    "utf8",
  );
  return out;
}

describe("loadRegistryViewNames", () => {
  it("extracts identifier and quoted keys from the registry literal", () => {
    expect(loadRegistryViewNames(writeRegistry())).toEqual([
      "echo",
      "quick-poll",
    ]);
  });

  it("throws a named error when the file is missing", () => {
    expect(() => loadRegistryViewNames(join(dir, "nope.ts"))).toThrowError(
      WidgetsManifestError,
    );
  });

  it("throws when no `registry = { ... } as const` literal is present", () => {
    const path = writeRegistry("export const other = {};\n");
    expect(() => loadRegistryViewNames(path)).toThrow(/as const/);
  });

  it("throws when the literal has no lazy-import entries", () => {
    const path = writeRegistry("export const registry = {} as const;\n");
    expect(() => loadRegistryViewNames(path)).toThrow(/no view entries/);
  });
});

describe("resolveBrowserOutDir", () => {
  it("appends /browser to a string outputPath", () => {
    expect(resolveBrowserOutDir("/ws", "dist/widgets")).toBe(
      join("/ws", "dist/widgets", "browser"),
    );
  });

  it("honors the object form with a custom browser subdir", () => {
    expect(
      resolveBrowserOutDir("/ws", { base: "dist/widgets", browser: "web" }),
    ).toBe(join("/ws", "dist/widgets", "web"));
  });

  it('treats browser: "" as emit-into-base', () => {
    expect(
      resolveBrowserOutDir("/ws", { base: "dist/widgets", browser: "" }),
    ).toBe(join("/ws", "dist/widgets"));
  });

  it("throws a named error when outputPath is absent", () => {
    expect(() => resolveBrowserOutDir("/ws", undefined)).toThrowError(
      WidgetsManifestError,
    );
  });
});

describe("validateWidgetsOutput", () => {
  it("derives entry, styles and per-view chunks from the emitted output", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({
      styles: true,
      views: { echo: {}, "quick-poll": {} },
    });

    const { manifest, missing } = validateWidgetsOutput({
      browserOutDir,
      registryPath,
    });

    expect(missing).toEqual([]);
    expect(manifest).toEqual({
      entry: "main-ABC123_-.js",
      styles: "styles-XYZ789.css",
      views: {
        echo: "echo.widget-B64_urlHash.js",
        "quick-poll": "quick-poll.widget-B64_urlHash.js",
      },
    });
  });

  // Angular 22's esbuild minifies dynamic imports to template literals, where
  // v20/v21 emitted double quotes. Matching only "…" reported every view as
  // missing and failed the build on output that was actually correct.
  it.each([['"', "double"], ["'", "single"], ["`", "template"]] as const)(
    "resolves view chunks when the entry uses %s (%s) quoted imports",
    (quote) => {
      const registryPath = writeRegistry();
      const browserOutDir = writeBrowserOut({
        quote,
        views: { echo: {}, "quick-poll": {} },
      });

      const { manifest, missing } = validateWidgetsOutput({
        browserOutDir,
        registryPath,
      });

      expect(missing).toEqual([]);
      expect(manifest.views).toEqual({
        echo: "echo.widget-B64_urlHash.js",
        "quick-poll": "quick-poll.widget-B64_urlHash.js",
      });
    },
  );

  it("does not match when the opening and closing quotes differ", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({ views: { echo: {} } });
    const entry = join(browserOutDir, "main-ABC123_-.js");
    writeFileSync(entry, 'import("./echo.widget-B64_urlHash.js`);\n', "utf8");

    expect(
      validateWidgetsOutput({ browserOutDir, registryPath }).missing,
    ).toContain("echo");
  });

  it("reports a registered view whose chunk is not imported by the entry", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({
      views: { echo: {}, "quick-poll": { imported: false, onDisk: false } },
    });

    const { manifest, missing } = validateWidgetsOutput({
      browserOutDir,
      registryPath,
    });

    expect(missing).toEqual(["quick-poll"]);
    expect(manifest.views).toEqual({ echo: "echo.widget-B64_urlHash.js" });
  });

  it("reports a view whose imported chunk never landed on disk", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({
      views: { echo: {}, "quick-poll": { onDisk: false } },
    });

    const { missing } = validateWidgetsOutput({ browserOutDir, registryPath });

    expect(missing).toEqual(["quick-poll"]);
  });

  it("styles is null when index.html links no stylesheet", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({ views: { echo: {}, "quick-poll": {} } });

    const { manifest } = validateWidgetsOutput({ browserOutDir, registryPath });

    expect(manifest.styles).toBeNull();
  });

  it("throws when index.html was not emitted", () => {
    const registryPath = writeRegistry();
    expect(() =>
      validateWidgetsOutput({
        browserOutDir: join(dir, "missing"),
        registryPath,
      }),
    ).toThrow(/did not emit/);
  });

  it("throws when index.html references no main entry script", () => {
    const registryPath = writeRegistry();
    const browserOutDir = writeBrowserOut({ views: {} });
    writeFileSync(join(browserOutDir, "index.html"), "<html></html>", "utf8");

    expect(() =>
      validateWidgetsOutput({ browserOutDir, registryPath }),
    ).toThrow(/main-\*\.js/);
  });
});

describe("writeManifest", () => {
  it("creates parent directories and emits pretty JSON with a trailing newline", () => {
    const path = join(dir, "src", "mcp", "views.manifest.json");
    const manifest = {
      entry: "main-A.js",
      styles: null,
      views: { echo: "echo.widget-A.js" },
    };

    writeManifest(path, manifest);

    const written = readFileSync(path, "utf8");
    expect(written.endsWith("\n")).toBe(true);
    expect(JSON.parse(written)).toEqual(manifest);
  });
});
