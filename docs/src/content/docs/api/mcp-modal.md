---
title: MCP_MODAL
description: The modal service for MCP Apps hosts, with an isOpen signal and a close method.
group: API
groupOrder: 5
order: 36
---

An MCP Apps host renders a modal in your frame. Therefore the view itself must know that it is in a
modal, and it must be able to close it. `MCP_MODAL` gives you both.

```ts
import { MCP_MODAL } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly modal = inject(MCP_MODAL);

  readonly isModal = this.modal.isOpen;

  dismiss() {
    this.modal.close();
  }
}
```

## McpModal

| Member | Type | Purpose |
| --- | --- | --- |
| `isOpen` | `Signal<boolean>` | `true` while the host reports the modal display mode. |
| `close` | `() => void` | Dismisses the modal. |

`close()` flips the local display state back to `inline`. It is synchronous, and it sends no
message to the host, because the modal is rendered in your frame.

`close()` is **not** the same as two neighbouring calls.

| Call | Effect |
| --- | --- |
| `MCP_MODAL.close()` | Closes the modal. The view stays. |
| [`injectRequestClose`](/docs/api/inject-request-close) | Removes the whole view. |
| [`injectDisplayMode`](/docs/api/inject-display-mode) `setDisplayMode("inline")` | Messages the host to change the mode. |

## The tokens and providers

| Symbol | Purpose |
| --- | --- |
| `MCP_MODAL` | The token that holds the resolved modal. |
| `MCP_MODAL_ENABLED` | `true` only on an MCP Apps host. |
| `provideMcpModal()` | Provides both tokens. |
| `createMcpModal(adaptor, enabled)` | The non-DI form. |

[`provideMcpUi()`](/docs/api/provide-mcp-ui) appends `provideMcpModal()` for you. Add it yourself
only when you build your own provider set.

## On other hosts

On an Apps SDK host, and during SSR, the feature is disabled. `MCP_MODAL` then resolves to a no-op
modal: `isOpen` is always `false`, and `close()` does nothing.

Therefore you can inject and call it without a host test. The Apps SDK host owns its own modal
chrome, so there is nothing for the view to close.

## The Escape key

When the feature is enabled, the service attaches a keydown listener, and Escape closes the modal.
The listener is removed on teardown. A host with no DOM, for example during SSR, skips it.

## Related

- [`injectRequestModal`](/docs/api/inject-request-modal) to open the modal
- [Host support](/docs/reference/host-support)
