/// <reference types="vite/client" />
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import analog from "@analogjs/platform";
import { type Plugin, defineConfig } from "vite";

// The hero badge shows the *published* version, read from the library package at
// build time so the site can never drift from what `npm i ng-mcp-ui` installs.
const pkg: { version: string } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../packages/ng-mcp-ui/package.json", import.meta.url)),
    "utf8",
  ),
);

// GitHub Pages serves a project site from /<repo>/; `vite dev` and a local
// preview serve from /. The docs workflow sets DOCS_BASE=/ng-mcp-ui/.
const base = process.env.DOCS_BASE ?? "/";
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
      routes.push(...docRoutes(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
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
