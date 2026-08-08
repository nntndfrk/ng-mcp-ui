---
title: injectRequestClose
description: Asks the host to dismiss the view.
group: API
groupOrder: 5
order: 28
---

```ts
injectRequestClose(): RequestCloseFn
```

```ts
type RequestCloseFn = () => Promise<void>;
```

```ts
import { injectRequestClose } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly requestClose = injectRequestClose();

  async done() {
    await this.requestClose();
  }
}
```

The call tears down the whole view. It is not the same as a close of a modal.

| You want | Use |
| --- | --- |
| Remove the view | `injectRequestClose` |
| Close a modal and keep the view | [`MCP_MODAL`](/docs/api/mcp-modal) `close()` |
| Make the view smaller | [`injectDisplayMode`](/docs/api/inject-display-mode) with `"inline"` |

## Write your state first

The view can go away as soon as the promise resolves. If you use
[`injectViewStore`](/docs/api/inject-view-store), its host writes are debounced, therefore a
pending write can be lost.

Call `flush()` first.

```ts
this.store.flush();
await this.requestClose();
```

## Host support

Supported on the two host runtimes, through different host calls.

| Host | Call |
| --- | --- |
| Apps SDK | The close request of the host. |
| MCP Apps | The teardown request of the host. |

## Related

- [`injectViewStore`](/docs/api/inject-view-store)
- [`injectDisplayMode`](/docs/api/inject-display-mode)
