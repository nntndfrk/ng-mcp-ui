---
title: injectFiles
description: Uploads a file to the host, gets a download URL, and opens the file picker of the host.
group: API
groupOrder: 5
order: 30
---

```ts
injectFiles(): InjectFilesResult
```

```ts
import { injectFiles } from "ng-mcp-ui/web";

export class UploadWidget {
  private readonly files = injectFiles();

  async attach(file: File) {
    try {
      const metadata = await this.files.upload(file);
      this.attached.set(metadata);
    } catch {
      this.showUrlField();
    }
  }
}
```

## Returns

| Function | Signature |
| --- | --- |
| `upload` | `(file: File, options?: { library?: boolean }) => Promise<FileMetadata>` |
| `getDownloadUrl` | `(file: FileMetadata) => Promise<{ downloadUrl: string }>` |
| `selectFiles` | `() => Promise<FileMetadata[]>` |

`FileMetadata` is `{ fileId, fileName?, mimeType? }`.

## upload

Set `library: true` to save the file into the library of the user, where the host supports it.

After an upload the adaptor records the file identifier in the host view state, therefore the
identifier survives a re-render.

## selectFiles

Opens the file picker of the host and resolves with the chosen files.

## These functions throw

This is an Apps SDK capability. On an MCP Apps host each of the three functions throws.

| Host | `upload` | `getDownloadUrl` | `selectFiles` |
| --- | --- | --- | --- |
| Apps SDK | Supported | Supported | Supported. Throws on an old host |
| MCP Apps | Throws | Throws | Throws |

An Apps SDK host without a picker throws this message:

```
selectFiles is not supported by the current host version.
```

Always use a `try`/`catch` block with a fallback path. Do not test the name of the host.

## The server side

Declare a file field in a tool schema with [`FileRef`](/docs/api/file-ref). The host then knows
that the field is a file, and it can show attach controls.

## Related

- [Files and downloads](/docs/guides/files)
- [`injectDownload`](/docs/api/inject-download)
- [`FileRef`](/docs/api/file-ref)
