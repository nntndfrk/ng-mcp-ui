---
title: injectRequestModal
description: Opens the view as a host modal, and reads whether the modal is open.
group: API
groupOrder: 5
order: 26
---

```ts
injectRequestModal(): InjectRequestModalResult
```

```ts
import { injectRequestModal } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly modal = injectRequestModal();

  readonly isOpen = this.modal.isOpen;

  showDetails(pollId: string) {
    this.modal.open({ title: "Poll details", params: { pollId } });
  }
}
```

## Returns

| Member | Type | Purpose |
| --- | --- | --- |
| `isOpen` | `Signal<boolean>` | `true` while the host reports the modal display mode. |
| `params` | `Signal<Record<string, unknown> \| undefined>` | The params of the current modal. |
| `open` | `(opts: RequestModalOptions) => void` | Asks the host to open the modal. |

## Options

| Option | Type | Purpose |
| --- | --- | --- |
| `title` | string, optional | The title of the dialog. |
| `params` | `Record<string, unknown>`, optional | Values that the modal content reads back through `params`. |
| `template` | string, optional | A host template to render. |
| `anchor` | `{ top?, left?, width?, height? }`, optional | Positions the dialog next to an element. |

## The params round trip

`open` sends `params`, and the `params` signal reads them back. Use the pair to tell the modal
content what to show.

```ts
this.modal.open({ params: { pollId: "42" } });
// inside the modal:
readonly pollId = computed(() => this.modal.params()?.["pollId"]);
```

## Closing

`open` has no matching close function on this wrapper. Two ways close the modal.

- The user dismisses it with the chrome of the host.
- On an MCP Apps host, [`MCP_MODAL`](/docs/api/mcp-modal) gives a `close()` method, and the Escape
  key works.

## Host support

Supported on the two host runtimes, through different mechanisms.

| Host | Mechanism |
| --- | --- |
| Apps SDK | The host opens its own modal. The call does not wait for a result. |
| MCP Apps | The adaptor changes the local display state, and the modal service renders the view in the frame. |

Because an MCP Apps modal is rendered in the frame, its close is a local update and not a host
round trip.

## Related

- [`MCP_MODAL`](/docs/api/mcp-modal)
- [`injectDisplayMode`](/docs/api/inject-display-mode)
