---
title: FileRef
description: A Zod schema for a host-managed file reference in a tool schema.
group: API
groupOrder: 5
order: 10
---

`FileRef` is a Zod object. Put it in a field of an `inputSchema` or an `outputSchema`. The host then
knows that the field is a file, and it can show attach controls and previews.

```ts
import { FileRef } from "ng-mcp-ui/server";
import { z } from "zod";

server.registerTool(
  {
    name: "summarize_document",
    inputSchema: z.object({ document: FileRef }),
  },
  async ({ document }) => {
    const res = await fetch(document.download_url);
    return { content: await summarize(await res.text()) };
  },
);
```

## Shape

| Field | Type | Contents |
| --- | --- | --- |
| `file_id` | string | The identifier of the file on the host. |
| `download_url` | string | The URL that gives the file contents. |
| `mime_type` | string, optional | |
| `file_name` | string, optional | |

## Value and type

The package exports `FileRef` two times under one name: as the Zod schema, and as the inferred
TypeScript type. Therefore you use the same name in a value position and in a type position.

```ts
import { FileRef } from "ng-mcp-ui/server";

const schema = z.object({ document: FileRef }); // value
function read(file: FileRef) { /* … */ }        // type
```

## In an output schema

Put `FileRef` in an `outputSchema` to give a file back to the host.

```ts
outputSchema: z.object({ report: FileRef })
```

The view then reads the reference from
[`injectToolInfo`](/docs/api/inject-tool-info), and it can pass the reference to
[`injectDownload`](/docs/api/inject-download).

## Related

- [Files and downloads](/docs/guides/files)
- [`injectFiles`](/docs/api/inject-files)
- [`registerTool`](/docs/api/register-tool)
