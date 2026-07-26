---
title: Theme and display mode
description: Adapting a widget to the host's theme, display mode, safe-area insets and available height.
group: Guides
groupOrder: 2
order: 4
---

Your widget renders inside someone else's product. It should follow their theme, respect their
chrome, and never assume how much room it has.

## injectLayout

`injectLayout()` returns a single `Signal<LayoutState>` covering the host's presentation:

```ts
import { computed } from "@angular/core";
import { injectLayout } from "ng-mcp-ui/web";

const layout = injectLayout();

const isDark = computed(() => layout().theme === "dark");
const maxHeight = computed(() => layout().maxHeight);
const insets = computed(() => layout().safeArea);
```

It carries the host theme, the current display mode, safe-area insets, and the maximum height the
host will give the iframe. Drive your CSS from it rather than from `prefers-color-scheme` — the host
theme is the one the user actually chose.

## injectDisplayMode

Display mode is both readable and requestable, so it gets its own wrapper returning
`{ displayMode, setDisplayMode }`:

```ts
import { injectDisplayMode } from "ng-mcp-ui/web";

const { displayMode, setDisplayMode } = injectDisplayMode();

displayMode();                 // "inline" | "fullscreen" | "pip"
setDisplayMode("fullscreen");  // ask the host to expand the view
```

The host may decline; treat `setDisplayMode` as a request, and keep rendering correctly in whatever
mode `displayMode()` reports.

## Sizing and closing

Two related forwarders:

```ts
import { injectRequestClose, injectRequestSize } from "ng-mcp-ui/web";

const requestSize = injectRequestSize();
const requestClose = injectRequestClose();

requestSize({ height: 480 });  // ask for a new iframe size
requestClose();                // ask the host to dismiss the view
```

## Who is looking at it

`injectUser()` returns a `Signal<UserState>` with whatever user information the host chose to
share. It is frequently empty — treat every field as optional and never gate core functionality on
it.

## Modals

On mcp-app hosts the library also wires an Angular modal service. `provideMcpUi()` appends
`provideMcpModal()` automatically; the surface is gated by `MCP_MODAL_ENABLED` and is a no-op on
hosts that do not support it, so calling it unconditionally is safe.
