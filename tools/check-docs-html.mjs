#!/usr/bin/env node
// Asserts that no prerendered docs page contains live markup inside a code
// span or code block.
//
// This is the artifact-level guard for an escaping bug that shipped once.
// Analog's build-time markdown renderer overrides marked's `codespan` and
// no-language `code` renderers and drops the escaping the defaults do, so
// `<script type="module">` written in prose reached the page as a real script
// element. The HTML parser then swallowed the rest of the article into it, and
// two pages ended mid-sentence with no build error anywhere. docs/vite.config.ts
// restores the escaping; this check proves it stayed restored.
//
// Shiki emits `<span>` elements inside a highlighted block, so those are the one
// tag allowed in here. Anything else means raw markup escaped the escaper.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "docs/dist/analog/public");

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...htmlFiles(path));
    } else if (entry.name.endsWith(".html")) {
      found.push(path);
    }
  }
  return found;
}

let files;
try {
  files = htmlFiles(dist);
} catch {
  console.error(
    `check-docs-html: no build output at ${relative(root, dist)}. Run the docs build first.`,
  );
  process.exit(1);
}

const codeElement = /<code(?:\s[^>]*)?>(.*?)<\/code>/gs;
const anyTag = /<\/?([a-zA-Z][\w:-]*)/g;
const findings = [];

for (const file of files) {
  const html = readFileSync(file, "utf8");
  for (const [, inner] of html.matchAll(codeElement)) {
    for (const [, tag] of inner.matchAll(anyTag)) {
      if (tag.toLowerCase() !== "span") {
        findings.push({
          file: relative(root, file),
          tag,
          excerpt: inner.slice(0, 80).replace(/\s+/g, " "),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(
    `check-docs-html: ${findings.length} raw HTML tag(s) inside code in the prerendered docs.\n` +
      "Markdown code is escaped by docs/vite.config.ts. A tag reaching the page live\n" +
      "truncates everything after it, so this fails the build.\n",
  );
  for (const { file, tag, excerpt } of findings.slice(0, 20)) {
    console.error(`  ${file}: <${tag}> in "${excerpt}"`);
  }
  process.exit(1);
}

console.log(
  `check-docs-html: ${files.length} pages, no raw markup in code. OK`,
);
