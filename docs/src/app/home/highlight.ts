export type TokenKind = "kw" | "str" | "cmt" | "";

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = [
  "import",
  "from",
  "export",
  "default",
  "class",
  "const",
  "return",
  "protected",
  "private",
  "readonly",
  "string",
  "null",
  "this",
];

// Order matters: strings and comments win over a keyword that happens to sit
// inside one.
const TOKEN = new RegExp(
  ["('[^']*')", "(//[^\\n]*)", `\\b(${KEYWORDS.join("|")})\\b`].join("|"),
  "g",
);

/**
 * Tiny highlighter for the landing page's one hand-written snippet, so it can
 * carry the comp's --kw/--str/--cmt colours without hand-authored markup.
 *
 * Markdown code fences elsewhere on the site go through Shiki instead; this
 * exists only because a component template cannot hold raw code safely.
 *
 * Returns one array of tokens per line, so the caller can render each line as
 * its own element and keep indentation exact.
 */
export function highlight(code: string): Token[][] {
  return code.split("\n").map((line) => {
    const tokens: Token[] = [];
    let cursor = 0;
    TOKEN.lastIndex = 0;

    let match = TOKEN.exec(line);
    while (match !== null) {
      if (match.index > cursor) {
        tokens.push({ text: line.slice(cursor, match.index), kind: "" });
      }
      const [text, str, comment] = match;
      tokens.push({ text, kind: str ? "str" : comment ? "cmt" : "kw" });
      cursor = match.index + text.length;
      match = TOKEN.exec(line);
    }

    if (cursor < line.length) {
      tokens.push({ text: line.slice(cursor), kind: "" });
    }
    return tokens;
  });
}
