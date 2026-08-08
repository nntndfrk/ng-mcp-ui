---
title: Theme and display mode
description: How to adapt a widget to the theme, the display mode, the safe-area insets and the available height of the host.
group: Guides
groupOrder: 2
order: 4
---

Your widget renders inside the product of another company. Therefore it must follow the theme of
that product, keep clear of its chrome, and make no assumption about the available space.

## injectLayout

[`injectLayout()`](/docs/api/inject-layout) gives you one `Signal<LayoutState>`.

```ts
import { computed } from "@angular/core";
import { injectLayout } from "ng-mcp-ui/web";

const layout = injectLayout();

const isDark = computed(() => layout().theme === "dark");
const maxHeight = computed(() => layout().maxHeight);
const insets = computed(() => layout().safeArea);
```

| Field | Contents |
| --- | --- |
| `theme` | `"light"` or `"dark"`. |
| `maxHeight` | The height the host gives the iframe, in pixels. It is `undefined` when the host sets no limit. |
| `safeArea` | The insets to keep clear of notches and home indicators. |

Drive your CSS from `theme`, and not from `prefers-color-scheme`. The host theme is the theme that
the user chose.

Treat `maxHeight` as a limit, and not as a target.

## injectDisplayMode

You can read the display mode, and you can ask for a different one. Therefore this key has its own
wrapper, and the wrapper gives you `{ displayMode, setDisplayMode }`.

```ts
import { injectDisplayMode } from "ng-mcp-ui/web";

const { displayMode, setDisplayMode } = injectDisplayMode();

displayMode();                 // "inline" | "fullscreen" | "pip" | "modal"
setDisplayMode("fullscreen");  // ask the host to expand the view
```

The host can refuse. Treat `setDisplayMode` as a request, and render correctly in the mode that
`displayMode()` reports.

You cannot request `"modal"`. That mode is host-driven. Use
[`injectRequestModal`](/docs/api/inject-request-modal) instead.

## Size and close

Two related forwarders drive the frame itself.

```ts
import { injectRequestClose, injectRequestSize } from "ng-mcp-ui/web";

const requestSize = injectRequestSize();
const requestClose = injectRequestClose();

requestSize({ height: 480 });  // ask for a new iframe size
requestClose();                // ask the host to dismiss the view
```

[`injectRequestSize`](/docs/api/inject-request-size) does nothing on an Apps SDK host, because that
host controls the size itself. The call still resolves, therefore it is safe on the two hosts.

[`injectRequestClose`](/docs/api/inject-request-close) removes the whole view. It does not close a
modal.

## Who looks at the view

[`injectUser()`](/docs/api/inject-user) gives you a `Signal<UserState>` with the locale and the
device capabilities.

Branch on `userAgent.capabilities`, and not on `device.type`. A tablet with a keyboard and a laptop
with a touch screen both exist.

Treat each field as a hint. Do not gate a core function of your widget on it.

## Modals

On an MCP Apps host the library also wires an Angular modal service.
[`provideMcpUi()`](/docs/api/provide-mcp-ui) appends `provideMcpModal()` for you.

`MCP_MODAL_ENABLED` gates the surface. On a host without this feature the service does nothing, and
`isOpen` is always `false`. Therefore you can inject and call it with no host test. See
[`MCP_MODAL`](/docs/api/mcp-modal).

## Host support

For the behavior of each function on each runtime, see
[host support](/docs/reference/host-support).
