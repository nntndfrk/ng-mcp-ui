export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3;
}

const HEADING = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
const ID = /\bid="([^"]*)"/;
const TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * Builds the "On this page" list from the HTML Analog's markdown route already
 * rendered, which it hands to the layout as route data.
 *
 * Reading the emitted ids — stamped by marked-gfm-heading-id — rather than
 * re-slugging the markdown source means a TOC anchor can never disagree with
 * the heading it points at. It also runs during prerender, so the list is in
 * the static HTML rather than scraped from the DOM after hydration.
 */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];

  for (const match of html.matchAll(HEADING)) {
    const id = ID.exec(match[2] ?? "")?.[1] ?? "";
    const text = (match[3] ?? "")
      .replace(TAG, "")
      .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITY[entity] ?? entity)
      .trim();

    if (id && text) {
      headings.push({ id, text, depth: match[1] === "3" ? 3 : 2 });
    }
  }

  return headings;
}
