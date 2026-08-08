---
title: Content helpers
description: text, image, audio, resourceLink, embeddedResource and normalizeContent build the content blocks of a tool result.
group: API
groupOrder: 5
order: 9
---

A tool result carries an array of MCP content blocks. These helpers build a correct block, so you
do not write the shape by hand.

```ts
import { text, image, resourceLink } from "ng-mcp-ui/server";

return {
  content: [text("Here is the chart."), image(png, "image/png")],
  structuredContent: { total: 42 },
};
```

## The helpers

| Helper | Signature |
| --- | --- |
| `text` | `(value: string, annotations?) => TextBlock` |
| `image` | `(data: string \| Uint8Array, mimeType: string, annotations?) => ImageBlock` |
| `audio` | `(data: string \| Uint8Array, mimeType: string, annotations?) => AudioBlock` |
| `resourceLink` | `(link: { uri, name, title?, description?, mimeType?, size? }, annotations?) => ResourceLinkBlock` |
| `embeddedResource` | `(resource: { uri, mimeType?, text } \| { uri, mimeType?, blob }, annotations?) => EmbeddedResourceBlock` |

`image` and `audio` accept a base64 string or a `Uint8Array`. The helper encodes a `Uint8Array` for
you.

`embeddedResource` accepts a text resource or a binary resource. Give `text` for one, and a base64
`blob` for the other.

## Annotations

Each helper takes an optional annotations object.

| Field | Type | Purpose |
| --- | --- | --- |
| `audience` | `("user" \| "assistant")[]` | Who the block is for. |
| `priority` | number | How important the block is. |
| `lastModified` | string | An ISO timestamp. |

```ts
text("Internal note.", { audience: ["assistant"], priority: 0.2 });
```

Use `audience: ["assistant"]` for content that helps the model but that the user does not need to
read.

## normalizeContent

```ts
normalizeContent(content: HandlerContent | undefined): ContentBlock[]
```

The server calls this function on the `content` field of each handler result. It accepts a loose
value and gives back a correct array of blocks.

| You return | You get |
| --- | --- |
| A string | One text block |
| One block | An array with that block |
| An array of blocks | The same array |
| A mixed array of strings and blocks | Each string becomes a text block |
| `undefined` | An empty array |

Therefore the short form is correct:

```ts
return { content: "Created the poll." };
```

Call `normalizeContent` yourself only when you build a result outside a tool handler.

## Related

- [`registerTool`](/docs/api/register-tool)
- [`FileRef`](/docs/api/file-ref)
