---
title: injectDownload
description: Asks the host to save MCP resource contents to the device of the user.
group: API
groupOrder: 5
order: 29
---

```ts
injectDownload(): { download: DownloadFn }
```

```ts
type DownloadFn = (params: { contents: (EmbeddedResource | ResourceLink)[] })
  => Promise<{ isError?: boolean }>;
```

```ts
import { injectDownload } from "ng-mcp-ui/web";

export class ReportWidget {
  private readonly downloader = injectDownload();

  async save() {
    const result = await this.downloader.download({
      contents: [{ type: "resource_link", uri: this.url(), name: "report.pdf" }],
    });

    if (result.isError) {
      this.showLinkInstead();
    }
  }
}
```

## It does not throw

The function always resolves. An unsupported host gives `{ isError: true }`, and the adaptor writes
a log message.

Therefore test the result. Do not use a `try`/`catch` block.

## contents

Pass MCP content blocks: a `ResourceLink` for a URL, or an `EmbeddedResource` for inline data.

Build the blocks on the server with the [content helpers](/docs/api/content-helpers), then read
them in the view from [`injectToolInfo`](/docs/api/inject-tool-info). Thus the view does not
construct the shape by hand.

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | **Returns `{ isError: true }`.** The adaptor writes a log message. |
| MCP Apps | Supported, if the host advertises the `downloadFile` capability. Without it, the result is `{ isError: true }`. |

The capability test happens inside the adaptor. Your code only reads `isError`.

Always give a fallback. A link that the user can open with
[`injectOpenExternal`](/docs/api/inject-open-external) works on each host.

## Related

- [Files and downloads](/docs/guides/files)
- [`injectFiles`](/docs/api/inject-files)
- [Host support](/docs/reference/host-support)
