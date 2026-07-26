import { injectContentFiles } from "@analogjs/content";
import { Injectable } from "@angular/core";

/**
 * Front matter every page under src/content/docs carries. This is the single
 * source of truth for navigation — the sidebar, prev/next, and the ⌘K palette
 * are all derived from it, so adding a page is one markdown file and nothing
 * else.
 */
export interface DocAttributes {
  title: string;
  description: string;
  /** Sidebar section heading, e.g. "Getting started". */
  group: string;
  /** Sort key for the section. */
  groupOrder: number;
  /** Sort key within the section. */
  order: number;
}

export interface DocEntry extends DocAttributes {
  /** Router path, e.g. /docs/getting-started/quickstart. */
  route: string;
}

export interface DocGroup {
  title: string;
  items: DocEntry[];
}

// Analog keys content files by their path relative to the vite root, which may
// or may not carry a leading slash depending on how the build was invoked —
// match on the bare segment so both shapes work.
const CONTENT_ROOT = "src/content/docs/";

@Injectable({ providedIn: "root" })
export class DocsIndex {
  /** Every doc page, flattened and ordered exactly as the sidebar shows them. */
  readonly entries: readonly DocEntry[];

  /** The same entries bucketed into sidebar sections. */
  readonly groups: readonly DocGroup[];

  constructor() {
    const files = injectContentFiles<DocAttributes>((file) =>
      file.filename.includes(CONTENT_ROOT),
    );

    this.entries = files
      .map((file) => {
        // Derive the route from the on-disk path rather than the `slug` Analog
        // infers, so nested folders survive: getting-started/quickstart.md
        // becomes /docs/getting-started/quickstart.
        const relative = file.filename.split(CONTENT_ROOT).at(-1) ?? "";
        return {
          ...file.attributes,
          route: `/docs/${relative.replace(/\.md$/, "")}`,
        };
      })
      .sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order);

    const groups: DocGroup[] = [];
    for (const entry of this.entries) {
      const last = groups.at(-1);
      if (last?.title === entry.group) {
        last.items.push(entry);
      } else {
        groups.push({ title: entry.group, items: [entry] });
      }
    }
    this.groups = groups;
  }

  /** Previous/next page in reading order, for the footer pager. */
  neighbours(route: string): { prev: DocEntry | null; next: DocEntry | null } {
    const index = this.entries.findIndex((entry) => entry.route === route);
    if (index === -1) {
      return { prev: null, next: null };
    }
    return {
      prev: this.entries[index - 1] ?? null,
      next: this.entries[index + 1] ?? null,
    };
  }

  find(route: string): DocEntry | null {
    return this.entries.find((entry) => entry.route === route) ?? null;
  }
}
