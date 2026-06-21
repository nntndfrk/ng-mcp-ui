import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { HandlerContent } from "./types.js";

/**
 * Coerce a tool handler's return value into an MCP `content` array. A plain
 * string becomes a single `TextContent`; a single {@link ContentBlock} is
 * wrapped in an array; `undefined` produces `[]`. Mostly used internally —
 * exported so consumers who build content lazily can apply the same
 * normalization the server uses.
 */
export function normalizeContent(
  content: HandlerContent | undefined,
): ContentBlock[] {
  if (content === undefined) {
    return [];
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [content];
}
