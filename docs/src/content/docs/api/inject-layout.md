---
title: injectLayout
description: A signal with the host theme, the available height, and the safe-area insets.
group: API
groupOrder: 5
order: 21
---

```ts
injectLayout(): Signal<LayoutState>
```

Read the layout that the host gives the view, then match it.

```ts
import { injectLayout } from "ng-mcp-ui/web";

export class PollWidget {
  readonly layout = injectLayout();
}
```

```html
<div [class.dark]="layout().theme === 'dark'"
     [style.max-height.px]="layout().maxHeight">
```

## LayoutState

| Field | Type | Contents |
| --- | --- | --- |
| `theme` | `"light" \| "dark"` | The theme of the host. |
| `maxHeight` | `number \| undefined` | The height the view may use, in pixels. `undefined` when the host sets no limit. |
| `safeArea` | `{ insets: { top, right, bottom, left } }` | Pixels to keep clear of notches and home indicators. |

## Theme

Match the host theme. A view that ignores it looks wrong on a dark host.

```css
:host { color-scheme: light dark; }
```

## maxHeight

Treat `maxHeight` as a limit, not as a target. A view taller than the limit is cut off or scrolls,
which depends on the host.

On a host that supports it you can ask for a different size with
[`injectRequestSize`](/docs/api/inject-request-size).

## Safe area

Apply the insets as padding on your outermost element.

```html
<div [style.padding-top.px]="layout().safeArea.insets.top">
```

## Host support

Supported on the two host runtimes. A host that reports no value gets a default: `"light"` for the
theme, and zero for each inset.

## Related

- [Theme and display mode](/docs/guides/theme-display-mode)
- [`injectDisplayMode`](/docs/api/inject-display-mode)
