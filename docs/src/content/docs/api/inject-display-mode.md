---
title: injectDisplayMode
description: Reads the current display mode and asks the host for a different one.
group: API
groupOrder: 5
order: 23
---

```ts
injectDisplayMode(): InjectDisplayModeResult
```

```ts
import { injectDisplayMode } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly display = injectDisplayMode();

  readonly mode = this.display.displayMode;

  expand() {
    this.display.setDisplayMode("fullscreen");
  }
}
```

## Returns

| Member | Type |
| --- | --- |
| `displayMode` | `Signal<DisplayMode>` |
| `setDisplayMode` | `(mode: RequestDisplayMode) => Promise<{ mode: RequestDisplayMode }>` |

## The modes

| Mode | Meaning | You can request it |
| --- | --- | --- |
| `"inline"` | In the flow of the conversation. | Yes |
| `"pip"` | A small floating panel. | Yes |
| `"fullscreen"` | The whole surface of the host. | Yes |
| `"modal"` | A host dialog. | No |

`"modal"` is host-driven. You cannot request it with `setDisplayMode`. Use
[`injectRequestModal`](/docs/api/inject-request-modal) instead.

The `RequestDisplayMode` type is `DisplayMode` without `"modal"`, therefore a wrong value is a
compile error.

## The host decides

`setDisplayMode` is a request. The host can refuse it. The promise resolves with the mode that the
host chose, which can differ from the mode you asked for.

Do not treat your own request as the new state. Read `displayMode()` instead, because it always
holds the real value.

```ts
await this.display.setDisplayMode("fullscreen");
this.display.displayMode();     // may still be "inline"
```

## Adapt the layout

Use the mode to change how much you show.

```ts
readonly columns = computed(() =>
  this.display.displayMode() === "fullscreen" ? 3 : 1,
);
```

## Host support

Supported on the two host runtimes.

## Related

- [Theme and display mode](/docs/guides/theme-display-mode)
- [`injectRequestModal`](/docs/api/inject-request-modal)
- [`injectRequestSize`](/docs/api/inject-request-size)
