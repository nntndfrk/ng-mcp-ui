---
title: Files and downloads
description: How to declare a file field with FileRef, and how to use injectFiles and injectDownload in a widget.
group: Guides
groupOrder: 2
order: 7
---

Files move in two directions. A different host supports each direction.

- On the server, a tool declares a file field with the `FileRef` schema. The host then knows that
  the field is a file. It can show attach controls and previews.
- In the view, `injectFiles()` sends files to the host and gets files from the host.
  `injectDownload()` tells the host to save resource contents to the user's device.

The two hosts are very different here. Read the
[host support matrix](/docs/reference/host-support) before you use these functions.

## FileRef in a tool schema

`FileRef` is a Zod object. Put it in an `inputSchema` or an `outputSchema`.

```ts
import { FileRef } from "ng-mcp-ui/server";

server.registerTool(
  {
    name: "summarize_document",
    inputSchema: { document: FileRef },
  },
  async ({ document }) => {
    const res = await fetch(document.download_url);
    // …
  },
);
```

| Field | Type | Notes |
| --- | --- | --- |
| `file_id` | string | The identifier of the file on the host. |
| `download_url` | string | The URL that gives the file contents. |
| `mime_type` | string, optional | |
| `file_name` | string, optional | |

The package exports `FileRef` as a value and as a type. Thus you can use the same name in a type
position.

## injectFiles

`injectFiles()` gives you three functions. Each function operates on the current host.

```ts
import { injectFiles } from "ng-mcp-ui/web";

const files = injectFiles();

await files.upload(file);                 // → FileMetadata
await files.getDownloadUrl(metadata);     // → { downloadUrl }
await files.selectFiles();                // → FileMetadata[]
```

| Function | Signature |
| --- | --- |
| `upload` | `(file: File, options?: { library?: boolean }) => Promise<FileMetadata>` |
| `getDownloadUrl` | `(file: FileMetadata) => Promise<{ downloadUrl: string }>` |
| `selectFiles` | `() => Promise<FileMetadata[]>` |

`FileMetadata` has this shape: `{ fileId, fileName?, mimeType? }`.

Set `library: true` in the `upload` options. The host then saves the file to the user's library, if
the host has this function.

Only an Apps SDK host supports these three functions. On an MCP Apps host, all three functions
throw an error. Put the calls in a `try`/`catch` block. Do not assume that the host has these
functions.

`selectFiles` also throws an error on an Apps SDK host that is too old:

```
selectFiles is not supported by the current host version.
```

After an upload, and after a successful selection, the Apps SDK adaptor writes the file identifiers
into the host view state. The identifiers stay available after a new render.

You must call `injectFiles()` from an Angular
[injection context](/docs/guides/host-bridge).

## injectDownload

`injectDownload()` gives you a `download` function. The function tells the host to save MCP
resource contents.

```ts
import { injectDownload } from "ng-mcp-ui/web";

const { download } = injectDownload();

const result = await download({
  contents: [{ type: "resource_link", uri: "https://…/report.pdf", name: "report.pdf" }],
});

if (result.isError) {
  // The host refused the download, or the host does not have this function.
}
```

The `contents` field takes MCP `EmbeddedResource` blocks or `ResourceLink` blocks. The function
does not throw an error. It resolves to `{ isError?: boolean }`. Thus you test a value, and you do
not catch an exception.

`download` is the opposite of `injectFiles`. Only an MCP Apps host supports it. The host must also
tell the adaptor that it has the `downloadFile` function. If the host does not have this function,
the adaptor writes a log message and resolves to `{ isError: true }`.

## Host support

| | Apps SDK | MCP Apps |
| --- | --- | --- |
| `upload` | Supported | Throws an error |
| `getDownloadUrl` | Supported | Throws an error |
| `selectFiles` | Supported. Throws an error on an old host | Throws an error |
| `download` | Writes a log message, returns `{ isError: true }` | Supported, if the host has `downloadFile` |

No host supports both sets of functions. A widget that needs files on the two runtimes must
therefore have two code paths. Use a `try`/`catch` block and a fallback path. Do not identify the
host by its name.
