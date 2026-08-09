/// <reference types="vite/client" />
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import analog from "@analogjs/platform";
import type { MarkedExtension } from "marked";
import { defineConfig, type Plugin } from "vite";

// The hero badge shows the *published* version, read from the library package at
// build time so the site can never drift from what `npm i ng-mcp-ui` installs.
const pkg: { version: string } = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../packages/ng-mcp-ui/package.json", import.meta.url),
    ),
    "utf8",
  ),
);

// GitHub Pages serves a project site from /<repo>/; `vite dev` and a local
// preview serve from /. The docs workflow sets DOCS_BASE=/ng-mcp-ui/.
// Destructured, not read as `process.env.DOCS_BASE`: this tsconfig sets
// `noPropertyAccessFromIndexSignature`, and Biome's `useLiteralKeys` rejects
// the bracket form that flag asks for.
const { DOCS_BASE } = process.env;
const base = DOCS_BASE ?? "/";
const siteUrl = `https://nntndfrk.github.io${base}`;

/**
 * Every markdown file under src/content/docs becomes /docs/<dir>/<name>.
 * Enumerated here (rather than via the `contentDir` prerender helper) so the
 * prerendered route list is exactly the on-disk tree, with no slug inference.
 */
function docRoutes(dir: URL, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      routes.push(
        ...docRoutes(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`),
      );
    } else if (entry.name.endsWith(".md")) {
      routes.push(`/docs/${prefix}${entry.name.slice(0, -".md".length)}`);
    }
  }
  return routes.sort();
}

const prefix = base.replace(/\/$/, "");

/**
 * Angular's RouterLink prefixes hrefs with the base href for us; a plain
 * markdown link cannot. Analog renders each content file to HTML at build time,
 * so rewrite the site-absolute links in that emitted HTML — a subpath
 * deployment then produces hrefs that survive right-click, share, and crawling,
 * not just the clicks the router intercepts.
 */
function markdownLinksUnderBase(): Plugin {
  // Matches href="/docs/… and the escaped href=\"/docs/… inside the emitted module.
  const link = /href=(\\?["'])\/docs\//g;
  return {
    name: "docs-markdown-links-under-base",
    // After analogjs-content-file (enforce: "post") has rendered the markdown.
    enforce: "post",
    transform(code, id) {
      if (!prefix || !id.includes("analog-content-file=true")) {
        return null;
      }
      return { code: code.replace(link, `href=$1${prefix}/docs/`), map: null };
    },
  };
}

/**
 * Restores the HTML escaping that marked does by default.
 *
 * Analog's build-time markdown setup replaces marked's `codespan` renderer with
 * `` `<code>${text}</code>` ``, and that replacement does not escape while the
 * renderer it replaces does. A code span therefore reached the page as live
 * markup: `<script type="module">` written in prose opened a real script
 * element, and the HTML parser swallowed the rest of the article into it, which
 * is how two pages ended mid-sentence with no error anywhere in the build.
 *
 * Analog offers no setting for this; `extensions` is the whole hook it exposes
 * (its options type is that array plus `mangle`), and ours registers after its
 * own, so this override wins. Fenced blocks need no equivalent: marked-shiki
 * rewrites every code token to finished HTML in `walkTokens` and treats a
 * language-less fence as `text`, so Shiki escapes those before a renderer runs.
 */
function escapeMarkdownHtml(): MarkedExtension {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  return {
    renderer: { codespan: ({ text }) => `<code>${escapeHtml(text)}</code>` },
  };
}

export default defineConfig(() => ({
  base,
  build: { target: ["es2022"] },
  resolve: { mainFields: ["module"] },
  define: {
    "import.meta.env.NG_MCP_UI_VERSION": JSON.stringify(pkg.version),
  },
  plugins: [
    markdownLinksUnderBase(),
    analog({
      // `static` skips the Nitro server build and emits prerendered pages only;
      // `ssr` must stay on for those pages to render at all.
      static: true,
      ssr: true,
      content: {
        highlighter: "shiki",
        markedOptions: { extensions: [escapeMarkdownHtml()] },
        shikiOptions: {
          highlight: {
            // Dual themes emit --shiki-light/--shiki-dark custom properties on
            // every token, so code blocks follow the site's theme toggle
            // (see the [data-theme] rules in src/styles.css).
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
          },
          highlighter: {
            additionalLangs: ["bash", "json", "diff"],
          },
        },
      },
      prerender: {
        routes: async () => [
          "/",
          // SPA fallback: GitHub Pages serves 404.html for any unknown path, so
          // a deep link that misses a prerendered file still boots the router.
          "/404.html",
          ...docRoutes(new URL("./src/content/docs/", import.meta.url)),
        ],
        sitemap: { host: siteUrl },
      },
      nitro: {
        routeRules: { "/404.html": { ssr: false } },
      },
    }),
  ],
}));
