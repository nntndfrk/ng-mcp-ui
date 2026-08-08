---
title: injectRequestSize
description: Asks the host to resize the view iframe.
group: API
groupOrder: 5
order: 27
---

```ts
injectRequestSize(): RequestSizeFn
```

```ts
type RequestSizeFn = (size: { width?: number; height?: number }) => Promise<void>;
```

```ts
import { injectRequestSize } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly requestSize = injectRequestSize();

  showAll() {
    this.requestSize({ height: 640 });
  }
}
```

Omit a dimension to leave it unchanged.

## The host decides

The call is a request. The host can refuse it, or it can give a different size. Read the real value
from [`injectLayout`](/docs/api/inject-layout), because `maxHeight` holds what you actually have.

## Measure, then ask

Pair the call with a `ResizeObserver` on your root element, so you ask for the height your content
needs.

```ts
const observer = new ResizeObserver(([entry]) => {
  this.requestSize({ height: entry.contentRect.height });
});
```

Do not call it on every frame. A host applies a size change asynchronously, therefore a tight loop
of requests is wasted work.

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | **No operation.** The call writes a warning and resolves. |
| MCP Apps | Supported. |

An Apps SDK host controls the size of the iframe itself. There is no equivalent call.

Because the promise resolves either way, a call is safe on the two hosts. Design the view so it
also works at the size the host gives you.

## Related

- [`injectLayout`](/docs/api/inject-layout)
- [`injectDisplayMode`](/docs/api/inject-display-mode)
- [Host support](/docs/reference/host-support)
